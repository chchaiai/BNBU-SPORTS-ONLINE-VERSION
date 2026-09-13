"""Deploy approved B and official icons over current production, with rollback."""
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
previous = base / 'releases/ocr-entry-approved-20260913'
release = base / 'releases/invite-brand-20260913'
work = Path('/home/ubuntu/bnbu-invite-brand-20260913')
assert (base / 'current').resolve() == previous and not release.exists()
gate = json.loads((work / 'validation.json').read_text())
assert gate['checks'] == {'backendCompile': 'PASS', 'inviteUnit': '3/3', 'portalBuild': 'PASS', 'portalTests': '43/43', 'androidDebugBuild': 'PASS'}

def output(args):
    return subprocess.check_output(args, text=True).strip()

def run(args):
    subprocess.run(args, check=True)

for component, expected in [('backend', 'sha256:c2b0ddd96f31b875f3846bf007cbeb766a11022f6404a3455426276c37bddc32'), ('portal', 'sha256:9916b2d49b5f681e8117c3cb3bfe96f2a689564738806bea0545115e950ea639')]:
    assert output(['docker', 'inspect', '--format', '{{.Image}}', f'bnbu-sports-production-{component}-1']) == expected
for name, digest in gate['files'].items():
    path = (work / name).resolve(strict=True)
    assert path.is_relative_to(work) and hashlib.sha256(path.read_bytes()).hexdigest() == digest
assert hashlib.sha256((previous / 'web/student/js/api.js').read_bytes()).hexdigest() == '1cd8df02276127ea138d691c8ef9b27329106fed276a234db0351fe6ff98b312'
old_index = (previous / 'web/student/index.html').read_text()
new_index = (work / 'student/index.html').read_text()
assert new_index.replace('  <link rel="icon" type="image/svg+xml" href="/student/bnbu-sports-icon.svg">\n', '') == old_index
images = {}
for component in ['backend', 'portal']:
    tag = f'bnbu-{component}-production:invite-brand-20260913'
    run(['docker', 'build', '--pull=false', '-t', tag, str(work / component)])
    images[component] = output(['docker', 'image', 'inspect', '--format', '{{.Id}}', tag])
shutil.copytree(previous, release)
env = (release / '.env').read_text()
for component in images:
    env, count = re.subn(r'(?m)^' + component.upper() + '_IMAGE=.*$', component.upper() + f'_IMAGE=bnbu-{component}-production:invite-brand-20260913', env)
    assert count == 1
(release / '.env').write_text(env)
for name in ['production.env', 'compose.yml', 'nginx.conf']:
    assert (previous / name).read_bytes() == (release / name).read_bytes()
for source in (work / 'student').rglob('*'):
    if source.is_file():
        shutil.copyfile(source, release / 'web/student' / source.relative_to(work / 'student'))

def switch(target):
    link = base / 'current-invite-brand-tmp'
    assert not link.exists() and not link.is_symlink()
    link.symlink_to(target)
    os.replace(link, base / 'current')

def start(target):
    run(['docker', 'compose', '--project-directory', str(target), 'up', '-d', '--no-build', '--pull', 'never', 'backend', 'portal'])
    for _ in range(90):
        if all(output(['docker', 'inspect', '--format', '{{.State.Health.Status}}', f'bnbu-sports-production-{c}-1']) == 'healthy' for c in images):
            return
        time.sleep(1)
    raise RuntimeError('Health timeout')

try:
    start(release)
    switch(release)
    for url in ['https://www.teacher.bnbusports.cn/', 'https://www.student.bnbusports.cn/student/', 'https://www.student.bnbusports.cn/api/v1/health/ready']:
        with urllib.request.urlopen(url, timeout=20) as response:
            assert response.status == 200
    for component, digest in images.items():
        assert output(['docker', 'inspect', '--format', '{{.Image}}', f'bnbu-sports-production-{component}-1']) == digest
    print(json.dumps({'result': 'PASS', 'release': str(release), 'previous': str(previous), 'images': images, 'migrationExecuted': False, 'naturalExpiryRegression': 'PENDING'}))
except Exception:
    if (base / 'current').resolve() != previous:
        switch(previous)
    start(previous)
    print(json.dumps({'result': 'FAILED_ROLLED_BACK'}))
    raise
