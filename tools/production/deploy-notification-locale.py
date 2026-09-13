"""Apply the additive notification release with verified application rollback."""
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
previous = base / 'releases/student-notification-copy-20260913'
release = base / 'releases/notification-locale-20260913'
work = Path('/home/ubuntu/notification-locale-release-v3')
assert (base / 'current').resolve() == previous and not release.exists()
gate = json.loads((work / 'validation.json').read_text())
build = json.loads((work / 'build-result.json').read_text())
assert build['result'] == 'PASS'
def output(args):
    return subprocess.check_output(args, text=True).strip()
def run(args):
    subprocess.run(args, check=True)
assert output(['docker', 'inspect', '--format', '{{.Image}}', 'bnbu-sports-production-backend-1']) == gate['baseImages']['backend']
portal_before = output(['docker', 'inspect', '--format', '{{.Id}} {{.Image}} {{.State.StartedAt}}', 'bnbu-sports-production-portal-1'])
for name, digest in gate['files'].items():
    path = (work / name).resolve(strict=True)
    assert path.is_relative_to(work) and hashlib.sha256(path.read_bytes()).hexdigest() == digest
for component, image in build['images'].items():
    assert output(['docker', 'image', 'inspect', '--format', '{{.Id}}', f'bnbu-{component}-production:notification-locale-20260913']) == image
backup = json.loads(output(['python3', '/home/ubuntu/backup-before-bugfix.py']))
assert backup['result'] == 'PASS'
shutil.copytree(previous, release)
env = (release / '.env').read_text()
for component in ['BACKEND', 'MIGRATOR']:
    env, count = re.subn(r'(?m)^' + component + '_IMAGE=.*$', component + f'_IMAGE=bnbu-{component.lower()}-production:notification-locale-20260913', env)
    assert count == 1
(release / '.env').write_text(env)
for source in (work / 'student').rglob('*'):
    if source.is_file():
        target = release / 'web/student' / source.relative_to(work / 'student')
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
def switch(target):
    link = base / 'current-notification-locale-tmp'
    assert not link.exists() and not link.is_symlink()
    link.symlink_to(target)
    os.replace(link, base / 'current')
def start(target):
    run(['docker', 'compose', '--project-directory', str(target), 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'backend'])
    for _ in range(60):
        try:
            with urllib.request.urlopen('https://www.student.bnbusports.cn/api/v1/health/ready', timeout=3) as response:
                if response.status == 200:
                    return
        except Exception:
            pass
        time.sleep(1)
    raise RuntimeError('Readiness timeout')
try:
    run(['docker', 'compose', '--project-directory', str(release), '--profile', 'migration', 'run', '--rm', 'migrator'])
    start(release)
    switch(release)
    for source in (work / 'student').rglob('*'):
        if source.is_file():
            name = source.relative_to(work / 'student').as_posix()
            with urllib.request.urlopen('https://www.student.bnbusports.cn/student/' + name + '?release=notification-locale-20260913', timeout=20) as response:
                assert hashlib.sha256(response.read()).hexdigest() == hashlib.sha256(source.read_bytes()).hexdigest()
    assert output(['docker', 'inspect', '--format', '{{.Image}}', 'bnbu-sports-production-backend-1']) == build['images']['backend']
    assert output(['docker', 'inspect', '--format', '{{.Id}} {{.Image}} {{.State.StartedAt}}', 'bnbu-sports-production-portal-1']) == portal_before
except Exception:
    if (base / 'current').resolve() != previous:
        switch(previous)
    start(previous)
    print(json.dumps({'result': 'FAILED_APPLICATION_ROLLED_BACK', 'database': 'Additive migration retained', 'backup': backup}))
    raise
result = {'result': 'PASS', 'release': str(release), 'images': build['images'], 'backup': backup, 'historyBackfill': 'PENDING', 'browserRegression': 'PENDING'}
(work / 'deployment-result.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
