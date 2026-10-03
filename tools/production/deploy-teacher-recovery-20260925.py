"""Pinned teacher recovery release with candidate tests and automatic rollback."""
from pathlib import Path
import hashlib, json, os, re, shutil, subprocess, sys, time, urllib.request

assert os.geteuid() == 0 and sys.argv[1:] in [['--prepare'], ['--apply'], ['--rollback']]
base = Path('/opt/bnbu-sports-production')
work = Path('/home/ubuntu/bnbu-teacher-recovery-20260925/bundle')
gate = json.loads((work / 'validation.json').read_text())
previous = base / 'releases' / gate['previous']
release = base / 'releases/teacher-recovery-20260925'
out = lambda a: subprocess.check_output(a, text=True).strip()
run = lambda a: subprocess.run(a, check=True)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
compose = lambda target, *args: ['docker', 'compose', '--project-directory', str(target), *args]

def baseline():
    assert (base / 'current').resolve() == previous
    for s in ['backend', 'portal']:
        assert out(['docker', 'inspect', '--format', '{{.Image}}', f'bnbu-sports-production-{s}-1']) == gate['baseImages'][s]
    assert out(['docker', 'exec', 'bnbu-sports-production-backend-1', 'sha256sum', '/app/dist/' + gate['backendFile']]).split()[0] == gate['before']

def healthy(name, seconds=90):
    for _ in range(seconds):
        if out(['docker', 'inspect', '--format', '{{.State.Health.Status}}', name]) == 'healthy': return
        time.sleep(1)
    raise RuntimeError('Health timeout: ' + name)

def start(target):
    run(compose(target, 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'backend', 'portal'))
    for s in ['backend', 'portal']: healthy(f'bnbu-sports-production-{s}-1')

def switch(target):
    link = base / 'current-teacher-recovery-tmp'
    assert not link.exists() and not link.is_symlink()
    link.symlink_to(target)
    os.replace(link, base / 'current')

def http(url):
    with urllib.request.urlopen(url, timeout=30) as response:
        assert response.status == 200
        return response.read()

def public_health():
    for url in ['https://www.teacher.bnbusports.cn/', 'https://www.student.bnbusports.cn/student/',
                'https://www.teacher.bnbusports.cn/api/v1/health/ready']:
        http(url)

def verify(target, before=False):
    args = compose(target, 'run', '--rm', '--no-deps', '--entrypoint', 'node',
        '-v', str(work / 'verify.mjs') + ':/app/verify-teacher-recovery.mjs:ro',
        'backend', '/app/verify-teacher-recovery.mjs')
    if before: args.append('--before')
    result = json.loads(out(args))
    assert result['result'] == 'PASS'
    return result

if sys.argv[1] == '--rollback':
    assert (base / 'current').resolve() == release
    start(previous); switch(previous); public_health()
    print('ROLLED_BACK'); raise SystemExit

assert gate['checks'] == {'backendUnit': 347, 'portalApi': 25, 'backendTypes': 'PASS', 'portalTypes': 'PASS', 'portalBuild': 'PASS'}
for name, digest in gate['files'].items(): assert sha(work / name) == digest, name
baseline()
if sys.argv[1] == '--prepare':
    assert not release.exists()
    images = {}
    for s in ['backend', 'portal']:
        run(['docker', 'tag', gate['baseImages'][s], f'bnbu-{s}-teacher-recovery-base:20260925'])
        tag = f'bnbu-{s}-production:teacher-recovery-20260925'
        with (work / (s + '-build.log')).open('w') as log:
            subprocess.run(['docker', 'build', '--pull=false', '-t', tag, str(work / s)], check=True, stdout=log, stderr=subprocess.STDOUT)
        images[s] = out(['docker', 'image', 'inspect', '--format', '{{.Id}}', tag])
    tests = out(['docker', 'run', '--rm', '--network', 'none', '--read-only', '--tmpfs', '/tmp',
        '--memory', '256m', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
        '-v', str(work / 'test.mjs') + ':/app/recovery.test.mjs:ro', '--entrypoint', 'node',
        images['backend'], '--test', '--test-reporter=tap', '/app/recovery.test.mjs'])
    assert '# tests 4' in tests and '# fail 0' in tests
    (work / 'candidate-tests.tap').write_text(tests)
    candidate = 'bnbu-teacher-recovery-portal-candidate'
    run(['docker', 'run', '--rm', '-d', '--name', candidate, '--network', 'none', '--read-only',
         '--tmpfs', '/tmp', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
         '--memory', '512m', '--health-interval', '2s', images['portal']])
    try: healthy(candidate, 50)
    finally: run(['docker', 'stop', candidate])
    baseline()
    shutil.copytree(previous, release)
    content = (release / '.env').read_text()
    for s, image in images.items():
        content, count = re.subn(r'(?m)^' + s.upper() + '_IMAGE=.*$', s.upper() + '_IMAGE=' + image, content)
        assert count == 1
    (release / '.env').write_text(content)
    for name in ['compose.yml', 'production.env', 'nginx.conf']:
        assert sha(previous / name) == sha(release / name)
    for p in (previous / 'web').rglob('*'):
        if p.is_file(): assert sha(p) == sha(release / p.relative_to(previous))
    before = verify(previous, True)
    candidate_check = verify(release)
    result = {'result': 'PREPARED', 'images': images, 'before': before,
              'candidateVerification': candidate_check, 'candidateTests': 4}
    (work / 'prepared.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result)); raise SystemExit

prepared = json.loads((work / 'prepared.json').read_text())
backup = json.loads(out(['python3', str(work / 'backup.py')]))
assert backup['result'] == 'PASS'
(work / 'backup.json').write_text(json.dumps(backup))
baseline()
try:
    start(release); switch(release); public_health()
    assert out(['docker', 'exec', 'bnbu-sports-production-backend-1', 'sha256sum', '/app/dist/' + gate['backendFile']]).split()[0] == gate['after']
    assets = {n: h for n, h in gate['files'].items() if n.startswith('portal/dist/client/assets/')}
    assert assets
    for name, digest in assets.items():
        assert hashlib.sha256(http('https://www.teacher.bnbusports.cn/' + name.removeprefix('portal/dist/client/'))).hexdigest() == digest, name
    verification = verify(release)
    result = {'result': 'PASS', 'release': str(release), 'previous': str(previous),
        'images': prepared['images'], 'backup': backup, 'verification': verification,
        'publicPortalAssets': len(assets), 'health': 'PASS', 'databaseMigrations': 0,
        'productionPasswordsChanged': 0, 'rollbackAvailable': True}
    (work / 'deployment.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))
except Exception:
    start(previous)
    if (base / 'current').resolve() != previous: switch(previous)
    public_health()
    raise
