"""Apply a pinned, migration-free student login overlay; retain the previous release."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid

BASE = Path('/opt/bnbu-sports-production')
WORK = Path('/home/ubuntu/bnbu-student-email-domain-20260915')
assert os.geteuid() == 0 and sys.argv[1:] in [['--prepare'], ['--apply'], ['--rollback']]
gate = json.loads((WORK / 'validation.json').read_text())
previous = BASE / 'releases' / 'aoksend-mail-20260915'
release = BASE / 'releases' / 'student-email-domain-20260915'
tag = 'bnbu-backend-production:student-email-domain-20260915'

def output(args):
    return subprocess.check_output(args, text=True).strip()

def run(args):
    subprocess.run(args, check=True)

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def switch(target):
    link = BASE / 'current-student-email-domain-tmp'
    assert not link.exists() and not link.is_symlink()
    link.symlink_to(target)
    os.replace(link, BASE / 'current')

def start(target):
    run(['docker', 'compose', '--project-directory', str(target), 'up', '-d', '--no-build', '--pull', 'never', 'backend'])
    for _ in range(90):
        if output(['docker', 'inspect', '--format', '{{.State.Health.Status}}', 'bnbu-sports-production-backend-1']) == 'healthy':
            return
        time.sleep(1)
    raise RuntimeError('Backend health timeout')

def http(path, expected=200, body=None, key=None):
    headers = {'User-Agent': 'BNBU-student-email-domain-verification'}
    if body is not None:
        headers.update({'Content-Type': 'application/json', 'Idempotency-Key': key or str(uuid.uuid4())})
    request = urllib.request.Request(path, data=None if body is None else json.dumps(body).encode(), headers=headers)
    try:
        response = urllib.request.urlopen(request, timeout=25)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        assert response.status == expected, (path, response.status)
        return response.read()

if sys.argv[1] == '--rollback':
    assert (BASE / 'current').resolve() in [previous, release]
    switch(previous)
    start(previous)
    print(json.dumps({'result': 'ROLLED_BACK'}))
    raise SystemExit

assert gate['checks'] == {'postgresHttp': 3, 'unit': 4, 'frontend': 4, 'smoke': 87, 'typecheck': 'PASS', 'build': 'PASS'}
assert (BASE / 'current').resolve() == previous
assert output(['docker', 'inspect', '--format', '{{.Image}}', 'bnbu-sports-production-backend-1']) == gate['baseImage']
for name, expected in gate['baselineStudent'].items():
    assert sha(previous / 'web' / name) == expected, name
for name, expected in gate['baselineBackend'].items():
    assert output(['docker', 'exec', 'bnbu-sports-production-backend-1', 'sha256sum', '/app/dist/' + name]).split()[0] == expected
for name, expected in gate['files'].items():
    path = (WORK / name).resolve(strict=True)
    assert path.is_relative_to(WORK) and sha(path) == expected, name

if sys.argv[1] == '--prepare':
    assert not release.exists()
    run(['docker', 'tag', gate['baseImage'], 'bnbu-backend-production:email-domain-base-20260915'])
    for path in (WORK / 'backend/dist').rglob('*'):
        os.chmod(path, 0o755 if path.is_dir() else 0o644)
    run(['docker', 'build', '--pull=false', '-t', tag, str(WORK / 'backend')])
    run(['docker', 'run', '--rm', '--network', 'none', '--read-only', '--entrypoint', 'node', tag,
         '--input-type=module', '-e', "await import('reflect-metadata');await import('./dist/modules/client-capabilities/client-authentication.service.js');await import('./dist/modules/users/email-verification.service.js');await import('./dist/modules/join-capabilities/application/join-capabilities.service.js');await import('./dist/modules/enrollments/application/qr-join.service.js');"])
    (WORK / 'prepared.json').write_text(json.dumps({'image': output(['docker', 'image', 'inspect', '--format', '{{.Id}}', tag])}))
    print('PREPARED')
    raise SystemExit

prepared = json.loads((WORK / 'prepared.json').read_text())
assert output(['docker', 'image', 'inspect', '--format', '{{.Id}}', tag]) == prepared['image']
assert not release.exists()
shutil.copytree(previous, release)
for name in gate['files']:
    if name.startswith('web/'):
        shutil.copyfile(WORK / name, release / name)
env = release / '.env'
content, count = re.subn(r'(?m)^BACKEND_IMAGE=.*$', 'BACKEND_IMAGE=' + prepared['image'], env.read_text())
assert count == 1
env.write_text(content)
for name in ['production.env', 'compose.yml', 'nginx.conf', 'mail.env']:
    assert (previous / name).read_bytes() == (release / name).read_bytes()
try:
    start(release)
    switch(release)
    for url in ['https://www.student.bnbusports.cn/student/', 'https://www.teacher.bnbusports.cn/',
                'https://www.student.bnbusports.cn/api/v1/health/ready', 'https://bnbusports.cn/']:
        http(url)
    for name, expected in gate['files'].items():
        if name.startswith('web/'):
            assert hashlib.sha256(http('https://www.student.bnbusports.cn/' + name[4:] + '?release=emaildomain15')).hexdigest() == expected
        elif name.startswith('backend/dist/'):
            assert output(['docker', 'exec', 'bnbu-sports-production-backend-1', 'sha256sum', '/app/' + name[8:]]).split()[0] == expected
    endpoint = 'https://www.student.bnbusports.cn/api/v1/auth/student-sign-in-codes'
    probes = []
    for account in ['suffix-probe@mail.bnbu.edu', 'suffix-probe@bnbu.edu.cn', 'bnbu-suffix-probe@example.invalid', 'suffix-probe@mail.bnbu.edu.cn.example.invalid']:
        for joining in [False, True]:
            body = {'organizationCode': 'BNBU', 'account': account, 'channel': 'EMAIL', 'locale': 'zh-CN'}
            if joining:
                body['joinInviteToken'] = 'invalid-invitation-token'
            invalid = json.loads(http(endpoint, 422, body))
            assert invalid['code'] == 'VALIDATION_FAILED'
            assert invalid['details']['fieldErrors'][0]['code'] == 'BNBU_EMAIL_REQUIRED'
            probes.append({'account': account, 'joining': joining, 'status': 422, 'requestId': invalid.get('requestId')})
    result = {'result': 'PASS', 'release': str(release), 'previous': str(previous), 'image': prepared['image'],
              'healthAndStaticHashes': 'PASS', 'backendHashes': 'PASS', 'invalidSuffixProbes': probes,
              'migrationExecuted': False, 'rollbackExercised': False}
    (WORK / 'deployment-result.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))
except Exception:
    switch(previous)
    start(previous)
    print('FAILED_ROLLED_BACK')
    raise
