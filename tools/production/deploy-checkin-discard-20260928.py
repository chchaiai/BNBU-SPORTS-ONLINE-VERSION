"""Publish the single tested student module, preserving the live release."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

BASE = Path('/opt/bnbu-sports-production')
WORK = Path('/home/ubuntu/checkin-discard-20260928')
PREVIOUS = BASE / 'releases/ui-refinement-20260925'
RELEASE = BASE / 'releases/checkin-discard-20260928'
MODULE = 'web/student/js/screens/checkin.js'
assert os.geteuid() == 0
assert sys.argv[1:] in [[], ['--rollback']]
gate = json.loads((WORK / 'validation.json').read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def states():
    return subprocess.check_output(['docker', 'inspect', '--format',
        '{{.Name}} {{.Id}} {{.Image}} {{.State.StartedAt}} {{.State.Health.Status}}',
        'bnbu-sports-production-backend-1', 'bnbu-sports-production-portal-1'], text=True).strip()


def inventory(root):
    return {p.relative_to(root).as_posix(): sha(p) for p in root.rglob('*') if p.is_file()}


def switch(target):
    link = BASE / 'current-checkin-discard-tmp'
    assert not link.exists() and not link.is_symlink()
    link.symlink_to(target)
    os.replace(link, BASE / 'current')


def get(url):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=15) as response:
                assert response.status == 200
                return response.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1)


def verify(digest):
    body = get('https://www.student.bnbusports.cn/student/js/screens/checkin.js?verify=discard-20260928')
    assert hashlib.sha256(body).hexdigest() == digest
    for host in ['www.student.bnbusports.cn', 'www.teacher.bnbusports.cn']:
        get('https://' + host + '/api/v1/health/ready')


if sys.argv[1:] == ['--rollback']:
    assert (BASE / 'current').resolve() == RELEASE
    assert sha(PREVIOUS / MODULE) == gate['beforeSha256']
    switch(PREVIOUS)
    verify(gate['beforeSha256'])
    print(json.dumps({'result': 'ROLLED_BACK', 'release': str(PREVIOUS)}))
    raise SystemExit

assert (BASE / 'current').resolve() == PREVIOUS
assert not RELEASE.exists()
assert gate['tests'] == {'passed': 13, 'failed': 0}
assert sha(PREVIOUS / MODULE) == gate['beforeSha256']
assert sha(WORK / 'checkin.js') == gate['afterSha256']
before_state = states()
assert before_state.count('healthy') == 2
baseline = inventory(PREVIOUS)
shutil.copytree(PREVIOUS, RELEASE, symlinks=True)
shutil.copyfile(WORK / 'checkin.js', RELEASE / MODULE)
candidate = inventory(RELEASE)
assert baseline.keys() == candidate.keys()
assert [p for p in baseline if baseline[p] != candidate[p]] == [MODULE]
assert inventory(PREVIOUS) == baseline
assert states() == before_state
try:
    switch(RELEASE)
    verify(gate['afterSha256'])
    assert states() == before_state
    assert inventory(PREVIOUS) == baseline
    result = {'result': 'PASS', 'release': str(RELEASE), 'previous': str(PREVIOUS),
        'changedFiles': [MODULE], 'publicSha256': gate['afterSha256'],
        'containerStatesUnchanged': True, 'containerStates': before_state,
        'rollbackAvailable': True, 'tests': gate['tests']}
    (WORK / 'deployment.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))
except Exception:
    switch(PREVIOUS)
    verify(gate['beforeSha256'])
    print(json.dumps({'result': 'FAILED_ROLLED_BACK'}))
    raise
