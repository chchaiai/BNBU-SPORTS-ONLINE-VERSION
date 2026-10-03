"""UI-only overlay on the captured production release, with automatic rollback."""
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
WORK = Path('/home/ubuntu/bnbu-ui-refinement-20260925/bundle')
RELEASE = BASE / 'releases/ui-refinement-20260925'
assert os.geteuid() == 0 and sys.argv[1:] in [['--prepare'], ['--apply'], ['--rollback']]
gate = json.loads((WORK / 'validation.json').read_text())
previous = BASE / 'releases' / gate['previous']
assert previous == BASE / 'releases/teacher-recovery-20260925'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
out = lambda args: subprocess.check_output(args, text=True).strip()
run = lambda args: subprocess.run(args, check=True)


def state(service):
    return out(['docker', 'inspect', '--format', '{{.Id}} {{.Image}} {{.State.StartedAt}} {{.State.Health.Status}}',
                'bnbu-sports-production-' + service + '-1'])


def baseline():
    assert (BASE / 'current').resolve() == previous
    for service, expected in gate['states'].items():
        assert state(service) == expected, service
    for name, digest in gate['releaseHashes'].items():
        assert sha(previous / name) == digest, name
    assert {p.relative_to(previous / 'web/student').as_posix(): sha(p)
            for p in (previous / 'web/student').rglob('*') if p.is_file()} == gate['studentHashes']


def healthy(name):
    for _ in range(60):
        if out(['docker', 'inspect', '--format', '{{.State.Health.Status}}', name]) == 'healthy':
            return
        time.sleep(1)
    raise RuntimeError('Portal health timeout: ' + name)


def start(target):
    run(['docker', 'compose', '--project-directory', str(target), 'up', '-d', '--no-deps',
         '--no-build', '--pull', 'never', 'portal'])
    healthy('bnbu-sports-production-portal-1')


def switch(target):
    assert target in [previous, RELEASE] and target.is_dir()
    link = BASE / 'current-ui-refinement-tmp'
    assert not link.exists() and not link.is_symlink()
    link.symlink_to(target)
    os.replace(link, BASE / 'current')


def http(url):
    with urllib.request.urlopen(url, timeout=30) as response:
        assert response.status == 200
        return response.read(), response.headers.get('Cache-Control', '')


def health():
    for url in ['https://www.teacher.bnbusports.cn/', 'https://www.student.bnbusports.cn/student/',
                'https://www.teacher.bnbusports.cn/api/v1/health/ready',
                'https://www.student.bnbusports.cn/api/v1/health/ready']:
        http(url)


if sys.argv[1] == '--rollback':
    assert (BASE / 'current').resolve() == RELEASE
    start(previous)
    switch(previous)
    health()
    print(json.dumps({'result': 'ROLLED_BACK', 'release': str(previous)}))
    raise SystemExit

for name, digest in gate['files'].items():
    path = (WORK / name).resolve(strict=True)
    assert path.is_relative_to(WORK) and sha(path) == digest, name
assert gate['checks']['types'] == gate['checks']['build'] == gate['checks']['baselineComparison'] == 'PASS'
assert gate['checks']['newPortalFailures'] == []
assert gate['checks']['newStudentFailures'] == []
baseline()

if sys.argv[1] == '--prepare':
    assert not RELEASE.exists()
    run(['docker', 'tag', gate['baseImages']['portal'], 'bnbu-portal-ui-refinement-base:20260925'])
    tag = 'bnbu-portal-production:ui-refinement-20260925'
    with (WORK / 'portal-build.log').open('w') as log:
        subprocess.run(['docker', 'build', '--pull=false', '-t', tag, str(WORK / 'portal')],
                       stdout=log, stderr=subprocess.STDOUT, check=True)
    image = out(['docker', 'image', 'inspect', '--format', '{{.Id}}', tag])
    candidate = 'bnbu-ui-refinement-candidate'
    run(['docker', 'run', '--rm', '-d', '--name', candidate, '--network', 'none', '--read-only',
         '--tmpfs', '/tmp', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
         '--memory', '512m', '--health-interval', '2s', image])
    try:
        healthy(candidate)
        assert out(['docker', 'exec', candidate, 'sha256sum', '/app/dist/server/index.js']).split()[0] == gate['files']['portal/dist/server/index.js']
    finally:
        run(['docker', 'stop', candidate])
    baseline()
    shutil.copytree(previous, RELEASE)
    contents, count = re.subn(r'(?m)^PORTAL_IMAGE=.*$', 'PORTAL_IMAGE=' + image, (RELEASE / '.env').read_text())
    assert count == 1
    (RELEASE / '.env').write_text(contents)
    for name in gate['studentDelta']:
        target = RELEASE / 'web/student' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(WORK / 'student' / name, target)
        assert sha(target) == gate['files']['student/' + name]
    expected = {'web/student/' + n for n in gate['studentDelta']} | {'.env'}
    changed = {p.relative_to(RELEASE).as_posix() for p in RELEASE.rglob('*') if p.is_file()
               and (not (previous / p.relative_to(RELEASE)).exists() or sha(p) != sha(previous / p.relative_to(RELEASE)))}
    assert changed == expected, changed
    assert all((RELEASE / p.relative_to(previous)).is_file() for p in previous.rglob('*') if p.is_file())
    for name in ['compose.yml', 'production.env', 'nginx.conf']:
        assert sha(RELEASE / name) == gate['releaseHashes'][name]
    result = {'result': 'PREPARED', 'image': image, 'previous': str(previous), 'release': str(RELEASE),
              'studentFiles': len(gate['studentDelta']), 'backendUnchanged': state('backend') == gate['states']['backend']}
    (WORK / 'prepared.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))
    raise SystemExit

prepared = json.loads((WORK / 'prepared.json').read_text())
try:
    start(RELEASE)
    switch(RELEASE)
    health()
    assert state('backend') == gate['states']['backend']
    assert state('portal').split()[1] == prepared['image']
    assets = {n: d for n, d in gate['files'].items() if n.startswith('portal/dist/client/assets/')}
    for name, digest in assets.items():
        body, _ = http('https://www.teacher.bnbusports.cn/' + name.removeprefix('portal/dist/client/'))
        assert hashlib.sha256(body).hexdigest() == digest, name
    for name in gate['studentDelta']:
        body, cache = http('https://www.student.bnbusports.cn/student/' + name)
        assert hashlib.sha256(body).hexdigest() == gate['files']['student/' + name], name
        assert 'no-store' in cache, (name, cache)
    result = {**prepared, 'result': 'PASS', 'portalAssetsVerified': len(assets), 'studentHashes': 'PASS',
              'health': 'PASS', 'databaseMigrations': 0, 'businessDataWrites': 0, 'rollbackAvailable': True}
    (WORK / 'deployment.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))
except Exception:
    start(previous)
    if (BASE / 'current').resolve() != previous:
        switch(previous)
    health()
    raise
