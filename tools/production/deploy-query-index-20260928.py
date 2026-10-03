"""Patch one runtime query on the live image, verify read-only, retain rollback."""
from pathlib import Path
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
WORK = Path('/home/ubuntu/query-index-20260928')
RELEASE = BASE / 'releases/query-index-20260928'
NAME = 'bnbu-sports-production-backend-1'
FILE = '/app/dist/modules/v8/v81-record-projection.js'
OLD = 'WHERE w.record_id::text IN (${Prisma.join(records.map((record) => record.id))})'
NEW = 'WHERE w.record_id IN (${Prisma.join(records.map((record) => Prisma.sql`${record.id}::uuid`))})'


def out(*args):
    return subprocess.check_output(args, text=True).strip()


def image():
    return out('docker', 'inspect', '--format', '{{.Image}}', NAME)


def compose(target, *args):
    return ['docker', 'compose', '--project-directory', str(target), *args]


def verify(target):
    result = json.loads(out(*compose(target, 'run', '--rm', '--no-deps', '--entrypoint', 'node',
        '-v', str(WORK / 'verify-candidate.mjs') + ':/app/verify-query-index.mjs:ro',
        'backend', '/app/verify-query-index.mjs')))
    assert result['result'] == 'PASS' and result['actualRuntimeQueryVerified']
    return result


def start(target):
    subprocess.run(compose(target, 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'backend'), check=True)
    for _ in range(60):
        if out('docker', 'inspect', '--format', '{{.State.Health.Status}}', NAME) == 'healthy':
            return
        time.sleep(1)
    raise RuntimeError('Backend health timeout')


def switch(target):
    link = BASE / 'current-query-index-tmp'
    assert not link.exists() and not link.is_symlink()
    link.symlink_to(target)
    os.replace(link, BASE / 'current')


def health():
    class LocalHTTPS(http.client.HTTPSConnection):
        def connect(self):
            self.sock = self._context.wrap_socket(socket.create_connection(('127.0.0.1', 443), 10), server_hostname=self.host)
    checks = []
    for host, path in [('www.student.bnbusports.cn', '/student/'), ('www.teacher.bnbusports.cn', '/'),
                       ('www.student.bnbusports.cn', '/api/v1/health/ready'),
                       ('www.teacher.bnbusports.cn', '/api/v1/health/ready')]:
        c = LocalHTTPS(host, timeout=15)
        c.request('GET', path)
        r = c.getresponse()
        r.read()
        c.close()
        assert r.status == 200, (host, path, r.status)
        checks.append({'host': host, 'path': path, 'status': r.status})
    return checks


assert os.geteuid() == 0 and sys.argv[1:] in (['--prepare'], ['--apply'], ['--rollback'])
gatefile = WORK / 'prepared.json'
if sys.argv[1] == '--prepare':
    assert not RELEASE.exists() and not gatefile.exists()
    previous = (BASE / 'current').resolve()
    base_image = image()
    portal = out('docker', 'inspect', '--format', '{{.Id}}', 'bnbu-sports-production-portal-1')
    content = subprocess.check_output(['docker', 'exec', NAME, 'cat', FILE])
    assert content.count(OLD.encode()) == 1
    patched = content.replace(OLD.encode(), NEW.encode())
    (WORK / 'v81-record-projection.js').write_bytes(patched)
    out('docker', 'tag', base_image, 'bnbu-query-index-base:20260928')
    (WORK / 'Dockerfile').write_text('FROM bnbu-query-index-base:20260928\nCOPY --chown=10001:10001 v81-record-projection.js ' + FILE + '\n')
    with (WORK / 'build.log').open('w') as log:
        subprocess.run(['docker', 'build', '--pull=false', '-t', 'bnbu-backend-production:query-index-20260928', str(WORK)], check=True, stdout=log, stderr=subprocess.STDOUT)
    candidate = out('docker', 'image', 'inspect', '--format', '{{.Id}}', 'bnbu-backend-production:query-index-20260928')
    out('docker', 'run', '--rm', '--network', 'none', '--read-only', '--entrypoint', 'node', candidate, '--check', FILE)
    shutil.copytree(previous, RELEASE)
    env, count = re.subn(r'(?m)^BACKEND_IMAGE=.*$', 'BACKEND_IMAGE=' + candidate, (RELEASE / '.env').read_text())
    assert count == 1
    (RELEASE / '.env').write_text(env)
    for p in previous.rglob('*'):
        if p.is_file() and p.name != '.env':
            assert p.read_bytes() == (RELEASE / p.relative_to(previous)).read_bytes()
    result = verify(RELEASE)
    assert (BASE / 'current').resolve() == previous and image() == base_image
    gate = {'previous': str(previous), 'baseImage': base_image, 'image': candidate, 'portal': portal,
            'before': hashlib.sha256(content).hexdigest(), 'after': hashlib.sha256(patched).hexdigest(),
            'verification': result}
    gatefile.write_text(json.dumps(gate, indent=2))
    print(json.dumps({'result': 'PREPARED', **gate}))
else:
    gate = json.loads(gatefile.read_text())
    previous = Path(gate['previous'])
    if sys.argv[1] == '--rollback':
        assert (BASE / 'current').resolve() == RELEASE and image() == gate['image']
        start(previous)
        switch(previous)
        health()
        print('ROLLED_BACK')
    else:
        assert (BASE / 'current').resolve() == previous and image() == gate['baseImage']
        assert out('docker', 'exec', NAME, 'sha256sum', FILE).split()[0] == gate['before']
        try:
            start(RELEASE)
            assert image() == gate['image']
            assert out('docker', 'exec', NAME, 'sha256sum', FILE).split()[0] == gate['after']
            checks = health()
            verification = verify(RELEASE)
            assert out('docker', 'inspect', '--format', '{{.Id}}', 'bnbu-sports-production-portal-1') == gate['portal']
            switch(RELEASE)
            report = {'result': 'PASS', 'release': str(RELEASE), 'previous': str(previous),
                      'checks': checks, 'verification': verification, 'rollbackAvailable': True,
                      'databaseMigrations': 0, 'runtimeFilesChanged': 1, 'portalUnchanged': True}
            (WORK / 'deployment.json').write_text(json.dumps(report, indent=2))
            print(json.dumps(report))
        except BaseException:
            start(previous)
            if (BASE / 'current').resolve() != previous:
                switch(previous)
            health()
            raise
