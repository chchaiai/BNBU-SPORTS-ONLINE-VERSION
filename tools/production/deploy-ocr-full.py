"""Apply the reviewed OCR release with health checks and application/config rollback."""
import hashlib, json, os, re, shutil, subprocess, sys, time, urllib.request
from pathlib import Path

assert os.geteuid() == 0
assert sys.argv[1:] in [['--apply'], ['--apply', '--ocr-upload-limit-approved']]
approved_limit = '--ocr-upload-limit-approved' in sys.argv
base = Path('/opt/bnbu-sports-production')
previous = base / 'releases/membership-20260913'
release = base / 'releases/ocr-full-20260913'
work = Path('/home/ubuntu/bnbu-ocr-full-20260913')
assert (base / 'current').resolve() == previous and not release.exists()
gate = json.loads((work / 'validation.json').read_text())
assert gate['localChecks'] == {'unit': '278/278', 'contract': '35/35', 'integration': '59/59',
                              'e2e': '104/104', 'typecheck': 'PASS', 'runtimeConformance': '263/263'}
assert re.fullmatch('[a-f0-9]{40}', gate['sourceCommit'])
for name, digest in gate['files'].items():
    target = (work / name).resolve(strict=True)
    assert target.is_relative_to(work) and target.is_file()
    assert hashlib.sha256(target.read_bytes()).hexdigest() == digest

def run(args):
    subprocess.run(args, check=True)

for service in ['backend', 'portal', 'migrator']:
    run(['docker', 'build', '--build-arg', 'SOURCE_COMMIT=' + gate['sourceCommit'],
         '-t', f'bnbu-{service}-production:ocr-full-20260913', str(work / service)])
run(['python3', str(work / 'backup-before-bugfix.py')])
shutil.copytree(previous, release)
env = release / '.env'
content = env.read_text()
for service in ['BACKEND', 'PORTAL', 'MIGRATOR']:
    content, count = re.subn(rf'(?m)^{service}_IMAGE=.*$',
        f'{service}_IMAGE=bnbu-{service.lower()}-production:ocr-full-20260913', content)
    assert count == 1
env.write_text(content)
runtime = release / 'production.env'
content = runtime.read_text()
for key, value in {'OCR_PROVIDER': 'TENCENT_TABLE_V3', 'OCR_WORKER_ENABLED': 'true',
                   'OCR_TENCENT_REGION': 'ap-guangzhou', 'OCR_TIMEOUT_MS': '20000'}.items():
    if re.search(rf'(?m)^{key}=', content):
        content, count = re.subn(rf'(?m)^{key}=.*$', f'{key}={value}', content)
        assert count == 1
    else:
        content += f'\n{key}={value}\n'
runtime.write_text(content)
site = Path('/etc/nginx/sites-enabled/bnbu-staging-hk.conf').resolve(strict=True)
old_nginx = site.read_text()
(work / 'nginx-before.conf').write_text(old_nginx)
new_nginx = old_nginx
if approved_limit:
    teacher = '    server_name www.teacher.bnbusports.cn;'
    assert old_nginx.count(teacher) == 1
    offset = old_nginx.index(teacher)
    anchor = '    location /api/v1/ {'
    position = old_nginx.index(anchor, offset)
    block = '''    # OCR file limit plus multipart overhead; approved for these two routes only.
    location ~ "^/api/v1/class-sections/[0-9a-fA-F-]{36}/ocr-(roster|physical)-batches$" {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $remote_addr;
        client_max_body_size 101m;
        proxy_request_buffering off;
        proxy_read_timeout 65s;
        access_log off;
    }
'''
    assert 'ocr-(roster|physical)-batches' not in old_nginx
    new_nginx = old_nginx[:position] + block + old_nginx[position:]
(release / 'nginx.conf').write_text(new_nginx)

def switch(target):
    link = base / 'current-ocr-tmp'
    assert not link.exists() and not link.is_symlink()
    link.symlink_to(target)
    os.replace(link, base / 'current')

def healthy():
    for _ in range(120):
        states = [subprocess.check_output(['docker', 'inspect', '--format', '{{.State.Health.Status}}',
                  f'bnbu-sports-production-{service}-1'], text=True).strip() for service in ['backend', 'portal']]
        if states == ['healthy', 'healthy']:
            return
        time.sleep(1)
    raise RuntimeError('Application health timeout')

try:
    # This additive function replacement preserves existing rows and is compatible
    # with the previous application if an application/config rollback is needed.
    run(['docker', 'compose', '--project-directory', str(previous), 'stop', 'backend'])
    run(['docker', 'compose', '--project-directory', str(release), '--profile', 'migration', 'run', '--rm', 'migrator'])
    run(['docker', 'compose', '--project-directory', str(release), 'up', '-d', '--no-build', '--pull', 'never', 'backend', 'portal'])
    healthy()
    switch(release)
    site.write_text(new_nginx)
    run(['nginx', '-t'])
    run(['systemctl', 'reload', 'nginx'])
    for url in ['https://www.student.bnbusports.cn/api/v1/health/ready',
                'https://www.student.bnbusports.cn/student/', 'https://www.student.bnbusports.cn/runtime-config.js',
                'https://www.teacher.bnbusports.cn/']:
        with urllib.request.urlopen(url, timeout=30) as response:
            assert response.status == 200 and response.read()
except Exception:
    (work / 'first-failure.json').write_text(json.dumps({'status': 'FAILED', 'time': time.time()}))
    switch(previous)
    site.write_text(old_nginx)
    run(['nginx', '-t'])
    run(['systemctl', 'reload', 'nginx'])
    run(['docker', 'compose', '--project-directory', str(previous), 'up', '-d', '--no-build', '--pull', 'never', 'backend', 'portal'])
    healthy()
    raise
result = {'check': 'OCR_FULL_DEPLOYMENT', 'status': 'PASS', 'sourceCommit': gate['sourceCommit'],
          'release': str(release), 'previous': str(previous), 'ocrUploadLimitApproved': approved_limit,
          'databaseMigration': '0075_ocr_course_closure_confirmation', 'runtimeOcrWorker': 'ENABLED', 'onlineFullRegression': 'PENDING'}
(work / 'deployment-result.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result))
