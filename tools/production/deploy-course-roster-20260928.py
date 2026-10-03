"""Publish the tested portal on the captured live baseline, with rollback."""
from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request

BASE = Path('/opt/bnbu-sports-production')
WORK = Path('/home/ubuntu/course-roster-20260928')
RELEASE = BASE / 'releases/course-roster-20260928'
PREVIOUS = BASE / 'releases/query-index-20260928'
EXPECTED = 'sha256:920e7dee422b60d672243713242a44f3b217c7d4805f6c6ca165a9c4a8e158de'
assert os.geteuid() == 0
assert sys.argv[1:] in [[], ['--rollback']]
out = lambda args: subprocess.check_output(args, text=True).strip()
run = lambda args: subprocess.run(args, check=True)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def state(service):
    return out(['docker', 'inspect', '--format', '{{.Id}} {{.Image}} {{.State.StartedAt}}',
                'bnbu-sports-production-' + service + '-1'])


def healthy(name):
    for _ in range(60):
        if out(['docker', 'inspect', '--format', '{{.State.Health.Status}}', name]) == 'healthy':
            return
        time.sleep(1)
    raise RuntimeError('Health timeout: ' + name)


def start(path):
    run(['docker', 'compose', '--project-directory', str(path), 'up', '-d',
         '--no-deps', '--no-build', '--pull', 'never', 'portal'])
    healthy('bnbu-sports-production-portal-1')


def switch(path):
    link = BASE / 'current-course-roster-tmp'
    assert not link.exists() and not link.is_symlink()
    link.symlink_to(path)
    os.replace(link, BASE / 'current')


def get(path):
    for attempt in range(3):
        try:
            with urllib.request.urlopen('https://www.teacher.bnbusports.cn' + path, timeout=20) as response:
                assert response.status == 200
                return response.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1)


if sys.argv[1:] == ['--rollback']:
    assert (BASE / 'current').resolve() == RELEASE
    start(PREVIOUS)
    switch(PREVIOUS)
    get('/')
    get('/api/v1/health/ready')
    print(json.dumps({'result': 'ROLLED_BACK', 'release': str(PREVIOUS)}))
    raise SystemExit

gate = json.loads((WORK / 'validation.json').read_text())
assert gate['result'] == 'PASS' and gate['newTestFailures'] == []
assert (BASE / 'current').resolve() == PREVIOUS
assert state('portal').split()[1] == EXPECTED
assert not RELEASE.exists()
backend = state('backend')
for name, digest in gate['files'].items():
    assert sha(WORK / name) == digest, name
baseline = {p.relative_to(PREVIOUS).as_posix(): sha(p) for p in PREVIOUS.rglob('*') if p.is_file()}
(WORK / 'baseline.json').write_text(json.dumps({'previous': str(PREVIOUS), 'portalImage': EXPECTED,
    'backend': backend, 'releaseHashes': baseline}, indent=2))
run(['docker', 'tag', EXPECTED, 'bnbu-portal-course-roster-base:20260928'])
run(['docker', 'build', '--pull=false', '-t', 'bnbu-portal-production:course-roster-20260928', str(WORK)])
image = out(['docker', 'image', 'inspect', '--format', '{{.Id}}', 'bnbu-portal-production:course-roster-20260928'])
name = 'bnbu-course-roster-candidate'
run(['docker', 'run', '--rm', '-d', '--name', name, '--network', 'none', '--read-only',
     '--tmpfs', '/tmp', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--health-interval', '2s', image])
try:
    healthy(name)
finally:
    run(['docker', 'stop', name])
assert (BASE / 'current').resolve() == PREVIOUS
assert state('portal').split()[1] == EXPECTED and state('backend') == backend
assert all(sha(PREVIOUS / p) == digest for p, digest in baseline.items())
shutil.copytree(PREVIOUS, RELEASE)
content, count = re.subn(r'(?m)^PORTAL_IMAGE=.*$', 'PORTAL_IMAGE=' + image, (RELEASE / '.env').read_text())
assert count == 1
(RELEASE / '.env').write_text(content)
try:
    start(RELEASE)
    switch(RELEASE)
    get('/')
    get('/api/v1/health/ready')
    assets = {p: digest for p, digest in gate['files'].items() if p.startswith('dist/client/assets/')}
    for p, digest in assets.items():
        assert hashlib.sha256(get('/' + p.removeprefix('dist/client/'))).hexdigest() == digest, p
    assert state('backend') == backend
    assert all(sha(RELEASE / p) == digest for p, digest in baseline.items() if p != '.env')
    result = {'result': 'PASS', 'release': str(RELEASE), 'previous': str(PREVIOUS), 'portalImage': image,
              'publicAssetsVerified': len(assets), 'backendUnchanged': True, 'databaseChanges': False,
              'releaseFilesPreserved': True, 'rollbackAvailable': True}
    (WORK / 'deployment.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))
except Exception:
    start(PREVIOUS)
    switch(PREVIOUS)
    raise
