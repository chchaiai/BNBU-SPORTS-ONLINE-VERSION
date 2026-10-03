"""Publish verified frontend assets with a warm portal and retained old chunks."""
from pathlib import Path
import gzip
import hashlib
import http.client
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time

BASE = Path('/opt/bnbu-sports-production')
WORK = Path('/home/ubuntu/student-bulk-actions-20260929')
PREVIOUS = BASE / 'releases/profile-correction-20260929'
RELEASE = BASE / 'releases/student-bulk-actions-20260929'
CONFIG = Path('/etc/nginx/sites-available/bnbu-staging-hk.conf')
SHARED = BASE / 'shared/access-speed'
OLD_IMAGE = 'sha256:78d6158fa0a4aa49b8399550c33279204a4a75b093dd55c9ee58f5f3752d9902'
TEMP = 'bnbu-student-bulk-actions-warm-portal'
assert os.geteuid() == 0
assert sys.argv[1:] in [['--prepare'], ['--apply'], ['--rollback']]
out = lambda args: subprocess.check_output(args, text=True).strip()
run = lambda args: subprocess.run(args, check=True)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
gate = json.loads((WORK / 'validation.json').read_text())
assert gate['result'] == 'PASS' and gate['newTestFailures'] == []


def state(service):
    return out(['docker', 'inspect', '--format', '{{.Id}} {{.Image}} {{.State.StartedAt}}',
                'bnbu-sports-production-' + service + '-1'])


def inventory(root):
    return {p.relative_to(root).as_posix(): sha(p) for p in root.rglob('*') if p.is_file()}


def healthy(name):
    for _ in range(90):
        if out(['docker', 'inspect', '--format', '{{.State.Health.Status}}', name]) == 'healthy':
            return
        time.sleep(1)
    raise RuntimeError('Container health timeout: ' + name)


class LocalHTTPS(http.client.HTTPSConnection):
    def connect(self):
        self.sock = self._context.wrap_socket(socket.create_connection(('127.0.0.1', 443), 10), server_hostname=self.host)


def fetch(host, path, headers=None):
    c = LocalHTTPS(host, timeout=15)
    try:
        c.request('GET', path, headers=headers or {})
        r = c.getresponse()
        return r.status, dict(r.getheaders()), r.read()
    finally:
        c.close()


def health():
    results = []
    for host, path in [('www.student.bnbusports.cn', '/student/'), ('www.teacher.bnbusports.cn', '/'),
                       ('www.student.bnbusports.cn', '/api/v1/health/ready'), ('www.teacher.bnbusports.cn', '/api/v1/health/ready')]:
        status, headers, body = fetch(host, path)
        assert status == 200, (host, path, status)
        assert 'no-store' in headers.get('Cache-Control', ''), (host, path, headers)
        results.append({'host': host, 'path': path, 'status': status})
    return results


def workers():
    return {int(line.split()[0]) for line in out(['ps', '-C', 'nginx', '-o', 'pid=,args=']).splitlines()
            if 'worker process' in line}


def reload_config(content):
    old = CONFIG.read_bytes()
    CONFIG.write_text(content)
    try:
        run(['nginx', '-t'])
    except Exception:
        CONFIG.write_bytes(old)
        raise
    pids = workers()
    run(['systemctl', 'reload', 'nginx'])
    time.sleep(2)
    return pids


def drain(pids):
    # Do not stop an upstream while old Nginx workers may still use it.
    deadline = time.monotonic() + 180
    while any(Path('/proc', str(pid)).exists() for pid in pids):
        if time.monotonic() > deadline:
            raise RuntimeError('Existing Nginx workers have not drained; refusing upstream stop')
        time.sleep(1)


def switch(target):
    assert target in [PREVIOUS, RELEASE] and target.is_dir()
    link = BASE / 'current-student-bulk-actions-tmp'
    assert not link.exists() and not link.is_symlink()
    link.symlink_to(target)
    os.replace(link, BASE / 'current')


def start_main(target):
    run(['docker', 'compose', '--project-directory', str(target), 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'portal'])
    healthy('bnbu-sports-production-portal-1')


def warm(image):
    assert not out(['docker', 'ps', '-aq', '--filter', 'name=^/' + TEMP + '$'])
    run(['docker', 'run', '-d', '--name', TEMP, '-p', '127.0.0.1:3101:3100',
         '--read-only', '--tmpfs', '/tmp', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
         '--memory', '512m', '--pids-limit', '128', '--health-interval', '2s',
         '--log-opt', 'max-size=10m', '--log-opt', 'max-file=2', image])
    healthy(TEMP)


def copy_immutable(source, target):
    for p in source.rglob('*'):
        if not p.is_file():
            continue
        dest = target / p.relative_to(source)
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists():
            assert sha(dest) == sha(p), 'Immutable path collision: ' + str(dest)
        else:
            shutil.copyfile(p, dest)
            dest.chmod(0o644)


def verify_assets():
    checked = 0
    for group, host, prefix, manifest in [
        ('portal', 'www.teacher.bnbusports.cn', '/assets/', gate['portalAssets']),
        ('old-portal', 'www.teacher.bnbusports.cn', '/assets/', json.loads((WORK / 'prepared.json').read_text())['oldAssets'])]:
        for name, digest in manifest.items():
            status, headers, body = fetch(host, prefix + name)
            assert status == 200 and hashlib.sha256(body).hexdigest() == digest, (group, name, status)
            assert headers.get('Cache-Control') == 'public, max-age=31536000, immutable', (group, name, headers)
            checked += 1
    return checked


def baseline_matches(baseline):
    assert (BASE / 'current').resolve() == PREVIOUS
    assert state('backend') == baseline['backend']
    assert state('portal') == baseline['portal']
    assert inventory(PREVIOUS) == baseline['releaseHashes']
    assert sha(CONFIG) == baseline['configSha256']


if sys.argv[1] == '--prepare':
    assert (BASE / 'current').resolve() == PREVIOUS and state('portal').split()[1] == OLD_IMAGE
    assert not RELEASE.exists() and not (WORK / 'prepared.json').exists()
    for name, digest in gate['files'].items():
        p = (WORK / name).resolve()
        assert p.is_relative_to(WORK) and sha(p) == digest, name
    baseline = {'backend': state('backend'), 'portal': state('portal'), 'releaseHashes': inventory(PREVIOUS), 'configSha256': sha(CONFIG)}
    (WORK / 'baseline.json').write_text(json.dumps(baseline, indent=2))
    original = CONFIG.read_text()
    (WORK / 'nginx-before.conf').write_text(original)
    compatible = original
    assert f'root {SHARED}/portal;' in compatible
    assert compatible.count('proxy_pass http://127.0.0.1:3100;') == 1
    (WORK / 'nginx-compatible.conf').write_text(compatible)
    (WORK / 'old-assets').mkdir()
    run(['docker', 'cp', 'bnbu-sports-production-portal-1:/app/dist/client/assets/.', str(WORK / 'old-assets')])
    old_assets = inventory(WORK / 'old-assets')
    copy_immutable(WORK / 'old-assets', SHARED / 'portal/assets')
    copy_immutable(WORK / 'dist/client/assets', SHARED / 'portal/assets')
    run(['docker', 'tag', OLD_IMAGE, 'bnbu-portal-student-bulk-actions-base:20260928'])
    with (WORK / 'image-build.log').open('w') as log:
        subprocess.run(['docker', 'build', '--pull=false', '-t', 'bnbu-portal-production:student-bulk-actions-20260929', str(WORK)], stdout=log, stderr=subprocess.STDOUT, check=True)
    image = out(['docker', 'image', 'inspect', '--format', '{{.Id}}', 'bnbu-portal-production:student-bulk-actions-20260929'])
    shutil.copytree(PREVIOUS, RELEASE, symlinks=True)
    env, count = re.subn(r'(?m)^PORTAL_IMAGE=.*$', 'PORTAL_IMAGE=' + image, (RELEASE / '.env').read_text())
    assert count == 1
    (RELEASE / '.env').write_text(env)
    candidate = inventory(RELEASE)
    assert candidate.keys() == baseline['releaseHashes'].keys()
    assert {n for n in candidate if candidate[n] != baseline['releaseHashes'][n]} == {'.env'}
    baseline_matches(baseline)
    prepared = {'image': image, 'oldAssets': old_assets, 'configSha256': hashlib.sha256(compatible.encode()).hexdigest(), 'release': str(RELEASE), 'previous': str(PREVIOUS)}
    (WORK / 'prepared.json').write_text(json.dumps(prepared, indent=2))
    print(json.dumps({'result': 'PREPARED', **prepared}), flush=True)
    raise SystemExit

baseline = json.loads((WORK / 'baseline.json').read_text())
prepared = json.loads((WORK / 'prepared.json').read_text())
compatible = (WORK / 'nginx-compatible.conf').read_text()
rollback = sys.argv[1] == '--rollback'
if rollback:
    assert (BASE / 'current').resolve() == RELEASE and sha(CONFIG) == prepared['configSha256']
    assert state('portal').split()[1] == prepared['image']
    target, image = PREVIOUS, OLD_IMAGE
else:
    baseline_matches(baseline)
    target, image = RELEASE, prepared['image']
assert state('backend') == baseline['backend']
warm(image)
started = False
try:
    old_workers = reload_config(compatible.replace('proxy_pass http://127.0.0.1:3100;', 'proxy_pass http://127.0.0.1:3101;'))
    health()
    drain(old_workers)
    print('Warm portal is serving; previous Nginx workers drained.', flush=True)
    started = True
    start_main(target)
    switch(target)
    old_workers = reload_config(compatible)
    checks = health()
    assert state('backend') == baseline['backend']
    assert state('portal').split()[1] == image
    assert inventory(PREVIOUS) == baseline['releaseHashes']
    count = verify_assets()
    status, _, html = fetch('www.student.bnbusports.cn', '/student/')
    expected = baseline['releaseHashes']['web/student/index.html']
    assert status == 200 and hashlib.sha256(html).hexdigest() == expected
    drain(old_workers)
    run(['docker', 'stop', '--time', '30', TEMP])
    run(['docker', 'rm', TEMP])
    report = {'result': 'ROLLED_BACK' if rollback else 'PASS', 'release': str(target), 'portalImage': image,
              'backendUnchanged': True, 'legacyStudentPreserved': True, 'immutableAssetsVerified': count,
              'oldPortalAssetsVerified': len(prepared['oldAssets']), 'health': checks,
              'warmSwitch': True, 'rollbackAvailable': True, 'businessDataWrites': 0, 'databaseMigrations': 0}
    (WORK / ('rollback.json' if rollback else 'deployment.json')).write_text(json.dumps(report, indent=2))
    print(json.dumps(report), flush=True)
except Exception:
    # The warm upstream remains available while restoring the original portal.
    recovery = RELEASE if rollback else PREVIOUS
    if started:
        start_main(recovery)
    switch(recovery)
    old_workers = reload_config(compatible)
    health()
    drain(old_workers)
    run(['docker', 'stop', '--time', '30', TEMP])
    run(['docker', 'rm', TEMP])
    print('FAILED_ROLLED_BACK; immutable paths retained for already-open pages.', flush=True)
    raise
