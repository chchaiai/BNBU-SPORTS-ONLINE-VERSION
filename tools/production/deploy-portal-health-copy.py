"""Deploy the isolated, validated portal copy fix, retaining rollback release."""
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
work = Path('/home/ubuntu/bnbu-portal-health-20260913')
previous = base / 'releases/invite-state-20260913'
release = base / 'releases/portal-health-20260913'
tag = 'bnbu-portal-production:health-copy-20260913'
gate = json.loads((work / 'validation.json').read_text())
assert gate['baseSource'] == 'a46fbe41f44b0724c00ee6d91944f5fdfc58cdf0'
assert gate['checks'] == {'build': 'PASS', 'focusedTests': '26/26'}
assert gate['changedSourceFiles'] == ['app/admin-i18n.ts', 'app/admin-overview.tsx', 'app/admin-subadmins.tsx']
assert (base / 'current').resolve() == previous and not release.exists()

def output(args):
    return subprocess.check_output(args, text=True).strip()

def run(args):
    subprocess.run(args, check=True)

assert output(['docker', 'image', 'inspect', '--format', '{{.Id}}', 'bnbu-portal-production:ocr-full-20260913']) == gate['baseImage']
for name, digest in gate['files'].items():
    path = (work / name).resolve(strict=True)
    assert path.is_relative_to(work) and path.is_file()
    assert hashlib.sha256(path.read_bytes()).hexdigest() == digest
run(['docker', 'build', '--pull=false', '-t', tag, str(work)])
image_id = output(['docker', 'image', 'inspect', '--format', '{{.Id}}', tag])
shutil.copytree(previous, release)
environment = release / '.env'
content, count = re.subn(r'(?m)^PORTAL_IMAGE=.*$', 'PORTAL_IMAGE=' + tag, environment.read_text())
assert count == 1
environment.write_text(content)
for name in ['production.env', 'compose.yml', 'nginx.conf']:
    assert (release / name).read_bytes() == (previous / name).read_bytes()

def switch(target):
    link = base / 'current-portal-health-tmp'
    assert not link.exists() and not link.is_symlink()
    link.symlink_to(target)
    os.replace(link, base / 'current')

def start(target):
    run(['docker', 'compose', '--project-directory', str(target), 'up', '-d', '--no-build', '--pull', 'never', 'portal'])
    for _ in range(90):
        if output(['docker', 'inspect', '--format', '{{.State.Health.Status}}', 'bnbu-sports-production-portal-1']) == 'healthy':
            return
        time.sleep(1)
    raise RuntimeError('Portal health timeout')

try:
    start(release)
    for url in ['https://www.teacher.bnbusports.cn/', 'https://www.student.bnbusports.cn/student/', 'https://www.student.bnbusports.cn/api/v1/health/ready']:
        with urllib.request.urlopen(url, timeout=20) as response:
            assert response.status == 200
    assert output(['docker', 'inspect', '--format', '{{.Image}}', 'bnbu-sports-production-portal-1']) == image_id
    switch(release)
    print(json.dumps({'check': 'PORTAL_HEALTH_COPY_DEPLOYMENT', 'result': 'PASS', 'release': str(release), 'previous': str(previous), 'imageId': image_id, 'baseSource': gate['baseSource'], 'patches': gate['patches'], 'rollbackExercised': False}))
except Exception:
    if (base / 'current').resolve() != previous:
        switch(previous)
    start(previous)
    print(json.dumps({'check': 'PORTAL_HEALTH_COPY_DEPLOYMENT', 'result': 'FAILED_ROLLED_BACK'}))
    raise
