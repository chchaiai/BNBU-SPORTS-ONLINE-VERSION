"""Deploy the validated portal bundle only; keep the previous release for rollback."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import urllib.request

assert os.geteuid() == 0
base = Path('/opt/bnbu-sports-production')
work = Path('/home/ubuntu/bnbu-maintenance-navigation-20260914')
previous = base / 'releases/admin-maintenance-20260914'
release = base / 'releases/maintenance-navigation-20260914'
tag = 'bnbu-portal-production:maintenance-navigation-20260914'
gate = json.loads((work / 'validation.json').read_text())
assert gate['checks'] == {'focusedTests': '36/36', 'typecheck': 'PASS', 'build': 'PASS'}
assert (base / 'current').resolve() == previous and not release.exists()

def output(args):
    return subprocess.check_output(args, text=True).strip()

def run(args):
    subprocess.run(args, check=True)

portal = 'bnbu-sports-production-portal-1'
backend = 'bnbu-sports-production-backend-1'
assert output(['docker', 'inspect', '--format', '{{.Image}}', portal]) == gate['basePortalImage']
assert output(['docker', 'image', 'inspect', '--format', '{{.Id}}', 'bnbu-portal-production:admin-maintenance-20260914']) == gate['basePortalImage']
backend_before = output(['docker', 'inspect', '--format', '{{.Id}} {{.Image}} {{.State.StartedAt}}', backend])
for name, digest in gate['files'].items():
    path = (work / name).resolve(strict=True)
    assert path.is_relative_to(work) and path.is_file()
    assert hashlib.sha256(path.read_bytes()).hexdigest() == digest
run(['docker', 'build', '--pull=false', '-t', tag, str(work)])
image_id = output(['docker', 'image', 'inspect', '--format', '{{.Id}}', tag])
shutil.copytree(previous, release)
env = release / '.env'
content, count = re.subn(r'(?m)^PORTAL_IMAGE=.*$', 'PORTAL_IMAGE=' + tag, env.read_text())
assert count == 1
env.write_text(content)
for name in ['production.env', 'compose.yml', 'nginx.conf']:
    assert (release / name).read_bytes() == (previous / name).read_bytes()

def switch(target):
    link = base / 'current-student-bulk-deletion-tmp'
    assert not link.exists() and not link.is_symlink()
    link.symlink_to(target)
    os.replace(link, base / 'current')

def start(target):
    run(['docker', 'compose', '--project-directory', str(target), 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'portal'])
    for _ in range(90):
        if output(['docker', 'inspect', '--format', '{{.State.Health.Status}}', portal]) == 'healthy':
            return
        time.sleep(1)
    raise RuntimeError('Portal health timeout')

try:
    start(release)
    assert output(['docker', 'inspect', '--format', '{{.Image}}', portal]) == image_id
    assert output(['docker', 'inspect', '--format', '{{.Id}} {{.Image}} {{.State.StartedAt}}', backend]) == backend_before
    for url in ['https://www.teacher.bnbusports.cn/', 'https://www.student.bnbusports.cn/student/', 'https://www.student.bnbusports.cn/api/v1/health/ready']:
        with urllib.request.urlopen(url, timeout=20) as response:
            assert response.status == 200
    # Prove every immutable browser asset is the validated build, without writing business data.
    assets = {name: sha for name, sha in gate['files'].items() if name.startswith('dist/client/assets/')}
    for name, sha in assets.items():
        url = 'https://www.teacher.bnbusports.cn/' + name.removeprefix('dist/client/')
        with urllib.request.urlopen(url, timeout=20) as response:
            assert hashlib.sha256(response.read()).hexdigest() == sha, name
    switch(release)
    print(json.dumps({'result': 'PASS', 'release': str(release), 'previous': str(previous), 'imageId': image_id,
                      'backendUnchanged': True, 'verifiedPublicAssets': len(assets), 'businessDeletesExecuted': 0}))
except Exception:
    if (base / 'current').resolve() != previous:
        switch(previous)
    start(previous)
    print(json.dumps({'result': 'FAILED_ROLLED_BACK'}))
    raise
