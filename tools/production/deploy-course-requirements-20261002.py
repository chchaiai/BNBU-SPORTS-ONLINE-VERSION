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
WORK = Path('/home/ubuntu/course-requirements-20261002')
RELEASE = BASE / 'releases/course-requirements-20261002'
NAME = 'bnbu-sports-production-backend-1'
FILE = '/app/dist/modules/v8/v81-admin-course-directory.js'
OLD = 'SELECT class_section_id AS "classSectionId",course_target AS course,general_target AS general'
NEW = OLD + ',\n          minimum_minutes AS "minimumMinutes",COALESCE(maximum_minutes,GREATEST(60,minimum_minutes)) AS "maximumMinutes",\n          weekly_limit AS "weeklyLimit",daily_limit AS "dailyLimit"'
ANCHOR = '                        currentMembers: metrics('
INSERT = '                        minimumMinutes: rule?.minimumMinutes ?? null, maximumMinutes: rule?.maximumMinutes ?? null,\n                        weeklyLimit: rule?.weeklyLimit ?? null, dailyLimit: rule?.dailyLimit ?? null,\n'
EXPECTED = 'f34df37bd164f67a64fb6c45e1fb56aecc84a652c3c9de0b3703c2828c76ca44'



def out(*args):
    return subprocess.check_output(args, text=True).strip()


def image():
    return out('docker', 'inspect', '--format', '{{.Image}}', NAME)


def compose(target, *args):
    return ['docker', 'compose', '--project-directory', str(target), *args]


def verify(target):
    result = json.loads(out(*compose(target, 'run', '--rm', '--no-deps', '--entrypoint', 'node',
        '-v', str(WORK / 'verify-candidate.mjs') + ':/app/verify-query-index.mjs:ro',
        '-v', str(WORK / 'before.js') + ':/app/dist/modules/v8/v81-admin-course-directory-before.js:ro',
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
    link = BASE / 'current-course-requirements-tmp'
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
    assert not gatefile.exists()
    previous = (BASE / 'current').resolve()
    base_image = image()
    portal = out('docker', 'inspect', '--format', '{{.Id}}', 'bnbu-sports-production-portal-1')
    content = subprocess.check_output(['docker', 'exec', NAME, 'cat', FILE])
    assert previous == BASE / 'releases/checkin-ui-final-20261002'
    assert hashlib.sha256(content).hexdigest() == EXPECTED
    assert content.count(OLD.encode()) == 1 and content.count(ANCHOR.encode()) == 1
    (WORK / 'before.js').write_bytes(content)
    patched = content.replace(OLD.encode(), NEW.encode()).replace(ANCHOR.encode(), INSERT.encode() + ANCHOR.encode())
    (WORK / 'v81-admin-course-directory.js').write_bytes(patched)
    out('docker', 'tag', base_image, 'bnbu-course-requirements-base:20261002')
    (WORK / 'Dockerfile').write_text('FROM bnbu-course-requirements-base:20261002\nCOPY --chown=10001:10001 v81-admin-course-directory.js ' + FILE + '\n')
    with (WORK / 'build.log').open('w') as log:
        subprocess.run(['docker', 'build', '--pull=false', '-t', 'bnbu-backend-production:course-requirements-20261002', str(WORK)], check=True, stdout=log, stderr=subprocess.STDOUT)
    candidate = out('docker', 'image', 'inspect', '--format', '{{.Id}}', 'bnbu-backend-production:course-requirements-20261002')
    out('docker', 'run', '--rm', '--network', 'none', '--read-only', '--entrypoint', 'node', candidate, '--check', FILE)
    if RELEASE.exists():
        assert not RELEASE.is_symlink()
        for p in previous.rglob('*'):
            if p.is_file() and p.name != '.env':
                assert p.read_bytes() == (RELEASE / p.relative_to(previous)).read_bytes()
    shutil.copytree(previous, RELEASE, symlinks=True, dirs_exist_ok=True)
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
                      'databaseMigrations': 0, 'businessDataWrites': 0, 'runtimeFilesChanged': 1, 'portalUnchanged': True}
            (WORK / 'deployment.json').write_text(json.dumps(report, indent=2))
            print(json.dumps(report))
        except BaseException:
            start(previous)
            if (BASE / 'current').resolve() != previous:
                switch(previous)
            health()
            raise
