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
WORK = Path('/home/ubuntu/bnbu-student-mail-guard-20260915')
assert os.geteuid() == 0 and sys.argv[1:] in [['--prepare'], ['--apply'], ['--rollback']]
gate = json.loads((WORK / 'validation.json').read_text())
previous = BASE / 'releases' / 'bug-20260915'
release = BASE / 'releases' / 'student-mail-guard-20260915'
tag = 'bnbu-backend-production:student-mail-guard-20260915'

def output(args):
    return subprocess.check_output(args, text=True).strip()

def run(args):
    subprocess.run(args, check=True)

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def switch(target):
    link = BASE / 'current-student-mail-guard-tmp'
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
    headers = {'User-Agent': 'BNBU-student-mail-guard-verification'}
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

assert gate['checks'] == {'postgresHttp': 6, 'unit': 17, 'typecheck': 'PASS', 'build': 'PASS'}
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
    assert output(['docker', 'image', 'inspect', '--format', '{{.Id}}', 'bnbu-backend-production:bug-20260915']) == gate['baseImage']
    run(['docker', 'build', '--pull=false', '-t', tag, str(WORK / 'backend')])
    run(['docker', 'run', '--rm', '--network', 'none', '--read-only', '--entrypoint', 'node', tag,
         '--input-type=module', '-e', "await import('reflect-metadata');await import('./dist/modules/client-capabilities/client-authentication.service.js');await import('./dist/modules/client-capabilities/client-capabilities.dto.js');"])
    (WORK / 'prepared.json').write_text(json.dumps({'image': output(['docker', 'image', 'inspect', '--format', '{{.Id}}', tag])}))
    print('PREPARED')
    raise SystemExit

prepared = json.loads((WORK / 'prepared.json').read_text())
assert output(['docker', 'image', 'inspect', '--format', '{{.Id}}', tag]) == prepared['image']
assert not release.exists()
shutil.copytree(previous, release)
for name in gate['baselineStudent']:
    shutil.copyfile(WORK / 'web' / name, release / 'web' / name)
env = release / '.env'
content, count = re.subn(r'(?m)^BACKEND_IMAGE=.*$', 'BACKEND_IMAGE=' + prepared['image'], env.read_text())
assert count == 1
env.write_text(content)
for name in ['production.env', 'compose.yml', 'nginx.conf']:
    assert (previous / name).read_bytes() == (release / name).read_bytes()
try:
    start(release)
    switch(release)
    for url in ['https://www.student.bnbusports.cn/student/', 'https://www.teacher.bnbusports.cn/',
                'https://www.student.bnbusports.cn/api/v1/health/ready', 'https://bnbusports.cn/']:
        http(url)
    for name in gate['baselineStudent']:
        assert hashlib.sha256(http('https://www.student.bnbusports.cn/' + name + '?release=mailguard15')).hexdigest() == gate['files']['web/' + name]
    for name in gate['baselineBackend']:
        assert output(['docker', 'exec', 'bnbu-sports-production-backend-1', 'sha256sum', '/app/dist/' + name]).split()[0] == gate['files']['backend/dist/' + name]
    endpoint = 'https://www.student.bnbusports.cn/api/v1/auth/student-sign-in-codes'
    body = {'organizationCode': 'BNBU', 'account': 'mail-guard-' + uuid.uuid4().hex + '@example.invalid', 'channel': 'EMAIL', 'locale': 'zh-CN'}
    key = str(uuid.uuid4())
    first = json.loads(http(endpoint, 202, body, key))
    replay = json.loads(http(endpoint, 202, body, key))
    assert first['data'] == replay['data']
    limited = json.loads(http(endpoint, 429, body))
    assert limited['code'] == 'AUTH_RATE_LIMITED' and 0 < limited['details']['retryAfterSeconds'] <= 60
    invalid = json.loads(http(endpoint, 401, {**body, 'joinInviteToken': 'invalid-invitation-token'}))
    assert invalid['code'] == 'AUTH_JOIN_CAPABILITY_INVALID'
    result = {'result': 'PASS', 'release': str(release), 'previous': str(previous), 'image': prepared['image'],
              'healthAndStaticHashes': 'PASS', 'backendHashes': 'PASS', 'unknownEmailAccepted': 202,
              'idempotentReplay': 'PASS', 'cooldown': 429, 'invalidInvitation': 401,
              'probeChallengeId': first['data']['challengeId'], 'migrationExecuted': False, 'rollbackExercised': False}
    (WORK / 'deployment-result.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))
except Exception:
    switch(previous)
    start(previous)
    print('FAILED_ROLLED_BACK')
    raise
