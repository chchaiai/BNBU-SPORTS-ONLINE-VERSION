"""Deploy the validated swimming intake and safe errors overlay on the pinned Hong Kong release."""
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
WORK = Path('/home/ubuntu/bnbu-swim-intake-20260914')
assert os.geteuid() == 0
assert sys.argv[1:] in [['--prepare'], ['--apply'], ['--rollback']]
gate = json.loads((WORK / 'validation.json').read_text())
assert len(gate['sourceCommit']) == 40
assert gate['checks'] == {'http': 'PASS', 'typecheck': 'PASS', 'build': 'PASS', 'student': 'PASS'}
assert gate['previous'] == 'search-20260914'
assert gate['release'] == 'swim-intake-20260914'
previous = BASE / 'releases' / gate['previous']
release = BASE / 'releases' / gate['release']
tags = {service: f'bnbu-{service}-production:{gate["release"]}' for service in ['backend']}

def output(args):
    return subprocess.check_output(args, text=True).strip()

def run(args):
    subprocess.run(args, check=True)

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def wait_healthy(names):
    for _ in range(90):
        if all(output(['docker', 'inspect', '--format', '{{.State.Health.Status}}', name]) == 'healthy' for name in names):
            return
        time.sleep(1)
    raise RuntimeError('Health check timed out')

def start(target):
    run(['docker', 'compose', '--project-directory', str(target), 'up', '-d', '--no-build', '--pull', 'never', 'backend'])
    wait_healthy([f'bnbu-sports-production-{service}-1' for service in tags])

def switch(target):
    link = BASE / 'current-swim-tmp'
    assert not link.exists() and not link.is_symlink()
    link.symlink_to(target)
    os.replace(link, BASE / 'current')

def http(url, expected=200, body=None):
    headers = {'User-Agent': 'BNBU-deployment-verification'}
    if body is not None:
        headers.update({'Content-Type': 'application/json', 'Idempotency-Key': str(uuid.uuid4())})
    request = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(), headers=headers)
    try:
        response = urllib.request.urlopen(request, timeout=25)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        assert response.status == expected, (url, response.status)
        return response.read()

def baseline():
    assert (BASE / 'current').resolve() == previous
    for service, image in gate['baseImages'].items():
        assert output(['docker', 'inspect', '--format', '{{.Image}}', f'bnbu-sports-production-{service}-1']) == image
    assert output(['docker', 'exec', 'bnbu-sports-production-backend-1', 'sha256sum', '/app/dist/common/errors/application-error.js']).split()[0] == gate['baselineBackendService']
    for name, digest in gate['baselineStudent'].items():
        assert sha(previous / 'web' / name) == digest

if sys.argv[1] == '--rollback':
    assert (BASE / 'current').resolve() in [previous, release]
    switch(previous)
    start(previous)
    print(json.dumps({'result': 'ROLLED_BACK', 'current': str(previous)}))
    raise SystemExit(0)

baseline()
for name, digest in gate['files'].items():
    path = (WORK / name).resolve(strict=True)
    assert path.is_relative_to(WORK) and path.is_file() and sha(path) == digest

if sys.argv[1] == '--prepare':
    assert not release.exists()
    for service, tag in tags.items():
        run(['docker', 'build', '--pull=false', '-t', tag, str(WORK / service)])
    images = {service: output(['docker', 'image', 'inspect', '--format', '{{.Id}}', tag]) for service, tag in tags.items()}
    run(['docker', 'run', '--rm', '--network', 'none', '--read-only', '--tmpfs', '/tmp', '--entrypoint', 'node', tags['backend'], '--input-type=module', '-e', "await import('reflect-metadata');const {publicErrorDetails}=await import('./dist/common/errors/application-error.js');if(publicErrorDetails({reason:'SWIM_INTAKE_REQUIRED'}).reason!=='SWIM_INTAKE_REQUIRED')throw Error('Projection failed');if('reason' in publicErrorDetails({reason:'private'}))throw Error('Unsafe projection');"])
    result = {'result': 'PASS', 'phase': 'PREPARED', 'images': images, 'sourceCommit': gate['sourceCommit'], 'migrationExecuted': False}
    (WORK / 'prepared.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))
    raise SystemExit(0)

prepared = json.loads((WORK / 'prepared.json').read_text())
assert prepared['result'] == 'PASS' and prepared['sourceCommit'] == gate['sourceCommit']
for service, tag in tags.items():
    assert output(['docker', 'image', 'inspect', '--format', '{{.Id}}', tag]) == prepared['images'][service]
assert not release.exists()
shutil.copytree(previous, release)
for name in gate['studentFiles']:
    shutil.copyfile(WORK / 'web' / name, release / 'web' / name)
env_path = release / '.env'
content = env_path.read_text()
for service, tag in tags.items():
    content, count = re.subn(r'(?m)^' + service.upper() + r'_IMAGE=.*$', service.upper() + '_IMAGE=' + tag, content)
    assert count == 1
env_path.write_text(content)
for name in ['production.env', 'compose.yml', 'nginx.conf']:
    assert (release / name).read_bytes() == (previous / name).read_bytes()

try:
    start(release)
    switch(release)
    checks = {}
    for url in ['https://www.teacher.bnbusports.cn/', 'https://www.student.bnbusports.cn/student/', 'https://www.student.bnbusports.cn/api/v1/health/ready', 'https://bnbusports.cn/']:
        http(url)
        checks[url] = 200
    for name in gate['studentFiles']:
        public_bytes = http('https://www.student.bnbusports.cn/' + name + '?release=' + gate['release'])
        assert hashlib.sha256(public_bytes).hexdigest() == gate['files']['web/' + name]
    for service in tags:
        assert output(['docker', 'inspect', '--format', '{{.Image}}', f'bnbu-sports-production-{service}-1']) == prepared['images'][service]
    result = {'result': 'PASS', 'phase': 'DEPLOYED', 'sourceCommit': gate['sourceCommit'], 'previous': str(previous), 'release': str(release), 'images': prepared['images'], 'health': checks, 'studentModuleHashes': 'PASS', 'migrationExecuted': False, 'runtimeConfiguration': 'PRESERVED', 'rollbackExercised': False}
    (WORK / 'deployment-result.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))
except Exception:
    if (BASE / 'current').resolve() != previous:
        switch(previous)
    start(previous)
    print(json.dumps({'result': 'FAILED_ROLLED_BACK', 'previous': str(previous)}))
    raise
