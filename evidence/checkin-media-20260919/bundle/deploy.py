"""Deploy the verified media recovery overlay, retaining an immutable rollback release."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import urllib.request

BASE = Path('/opt/bnbu-sports-production')
WORK = Path('/home/ubuntu/bnbu-checkin-media-20260919')
RELEASE = BASE / 'releases/checkin-media-20260919'
TAG = 'bnbu-backend-production:checkin-media-20260919'
BASE_TAG = 'bnbu-backend-production:checkin-media-base-20260919'
gate = json.loads((WORK / 'validation.json').read_text())
previous = Path(gate['previous']).resolve(strict=True)
assert previous.is_relative_to(BASE / 'releases') and previous != RELEASE
assert os.geteuid() == 0 and sys.argv[1:] in [['--prepare'], ['--apply'], ['--rollback']]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
output = lambda args: subprocess.check_output(args, text=True).strip()

def run(args):
    subprocess.run(args, check=True)

def switch(target):
    assert target.is_relative_to(BASE / 'releases') and target.is_dir()
    link = BASE / 'current-checkin-media-tmp'
    assert not link.exists() and not link.is_symlink()
    link.symlink_to(target)
    os.replace(link, BASE / 'current')

def start(target):
    run(['docker', 'compose', '--project-directory', str(target), 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'backend'])
    for _ in range(90):
        if output(['docker', 'inspect', '--format', '{{.State.Health.Status}}', 'bnbu-sports-production-backend-1']) == 'healthy':
            return
        time.sleep(1)
    raise RuntimeError('Backend health timeout')

def http(url):
    with urllib.request.urlopen(url, timeout=25) as response:
        assert response.status == 200, response.status
        return response.read()

if sys.argv[1] == '--rollback':
    assert (BASE / 'current').resolve() in [previous, RELEASE]
    switch(previous)
    start(previous)
    http('https://www.student.bnbusports.cn/api/v1/health/ready')
    print(json.dumps({'result': 'ROLLED_BACK', 'release': str(previous)}))
    raise SystemExit

assert gate['checks']['candidateBrowser'] == 'PASS' and gate['checks']['candidateUnit'] == 8
assert set(gate['baselineBackend']) == {'modules/exercise-records/application/exercise-records.service.js'}
assert (BASE / 'current').resolve() == previous
assert output(['docker', 'inspect', '--format', '{{.Image}}', 'bnbu-sports-production-backend-1']) == gate['baseImage']
assert output(['docker', 'inspect', '--format', '{{.Image}}', 'bnbu-sports-production-portal-1']) == gate['portalImage']
for name, expected in gate['baselineFiles'].items():
    assert sha(previous / name) == expected, name
for name, expected in gate['baselineBackend'].items():
    assert output(['docker', 'exec', 'bnbu-sports-production-backend-1', 'sha256sum', '/app/dist/' + name]).split()[0] == expected, name
for name, expected in gate['files'].items():
    file = (WORK / name).resolve(strict=True)
    assert file.is_relative_to(WORK) and sha(file) == expected, name

if sys.argv[1] == '--prepare':
    assert not RELEASE.exists()
    run(['docker', 'tag', gate['baseImage'], BASE_TAG])
    run(['docker', 'build', '--pull=false', '-t', TAG, str(WORK / 'backend')])
    run(['docker', 'run', '--rm', '--network', 'none', '--read-only', '--entrypoint', 'node', TAG,
         '--input-type=module', '-e', "await import('reflect-metadata');await import('./dist/modules/exercise-records/application/exercise-records.service.js');"])
    prepared = {'image': output(['docker', 'image', 'inspect', '--format', '{{.Id}}', TAG])}
    (WORK / 'prepared.json').write_text(json.dumps(prepared))
    print(json.dumps({'result': 'PREPARED', **prepared}))
    raise SystemExit

prepared = json.loads((WORK / 'prepared.json').read_text())
assert output(['docker', 'image', 'inspect', '--format', '{{.Id}}', TAG]) == prepared['image']
assert not RELEASE.exists()
shutil.copytree(previous, RELEASE)
for name in ['web/student/js/api.js','web/student/js/screens/checkin.js']:
    shutil.copyfile(WORK/name, RELEASE/name)
content, count = re.subn(r'(?m)^BACKEND_IMAGE=.*$', 'BACKEND_IMAGE=' + prepared['image'], (RELEASE / '.env').read_text())
assert count == 1
(RELEASE / '.env').write_text(content)
for name in ['nginx.conf', 'production.env', 'compose.yml']:
    assert sha(RELEASE / name) == gate['baselineFiles'][name]
assert (BASE / 'current').resolve() == previous
try:
    start(RELEASE)
    switch(RELEASE)
    health = {url: len(http(url)) for url in [
        'https://www.student.bnbusports.cn/student/',
        'https://www.student.bnbusports.cn/api/v1/health/ready',
        'https://www.teacher.bnbusports.cn/',
        'https://bnbusports.cn/']}
    for name in ['js/api.js','js/screens/checkin.js']:
        for suffix in ['', '?verify=checkin-media-20260919']:
            assert hashlib.sha256(http('https://www.student.bnbusports.cn/student/'+name+suffix)).hexdigest() == gate['files']['web/student/'+name]
    for name in gate['baselineBackend']:
        assert output(['docker', 'exec', 'bnbu-sports-production-backend-1', 'sha256sum', '/app/dist/' + name]).split()[0] == gate['files']['backend/dist/' + name], name
    assert output(['docker', 'inspect', '--format', '{{.Image}}', 'bnbu-sports-production-portal-1']) == gate['portalImage']
    result = {'result': 'PASS', 'release': str(RELEASE), 'previous': str(previous), 'image': prepared['image'],
              'healthAndStaticHashes': 'PASS', 'backendHashes': 'PASS', 'sites': list(health),
              'migrationExecuted': False, 'realStudentBusinessWrites': 0, 'rollbackAvailable': True}
    (WORK / 'deployment.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))
except Exception:
    switch(previous)
    start(previous)
    assert output(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-backend-1']) == gate['baseImage']
    http('https://www.student.bnbusports.cn/api/v1/health/ready')
    print('FAILED_ROLLED_BACK')
    raise
