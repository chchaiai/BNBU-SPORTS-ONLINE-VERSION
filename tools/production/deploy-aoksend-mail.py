"""Pinned mail-only release overlay with independent configuration and rollback."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import urllib.request

BASE = Path('/opt/bnbu-sports-production')
WORK = Path('/home/ubuntu/bnbu-aoksend-release-20260915')
PREVIOUS = BASE / 'releases/student-mail-guard-20260915'
RELEASE = BASE / 'releases/aoksend-mail-20260915'
IMAGE = 'sha256:a1f4fe61a66db2b988fa161a6369d0b15454b914f8671d7a209edf8aa30bc791'
TAG = 'bnbu-backend-production:aoksend-mail-20260915'
CONTAINER = 'bnbu-sports-production-backend-1'

def out(args):
    return subprocess.check_output(args, text=True).strip()

def run(args):
    subprocess.run(args, check=True)

def switch(target):
    link = BASE / 'current-aoksend-tmp'
    assert not link.exists() and not link.is_symlink()
    link.symlink_to(target)
    os.replace(link, BASE / 'current')

def start(target):
    run(['docker', 'compose', '--project-directory', str(target), 'up', '-d', '--no-build', '--pull', 'never', 'backend'])
    for _ in range(60):
        if out(['docker', 'inspect', '--format', '{{.State.Health.Status}}', CONTAINER]) == 'healthy':
            return
        time.sleep(1)
    raise RuntimeError('Backend health timeout')

assert os.geteuid() == 0
assert sys.argv[1:] in [['--prepare'], ['--apply'], ['--rollback']]
if sys.argv[1] == '--rollback':
    assert (BASE / 'current').resolve() == RELEASE
    start(PREVIOUS)
    switch(PREVIOUS)
    print('ROLLED_BACK')
    raise SystemExit

assert (BASE / 'current').resolve() == PREVIOUS
assert out(['docker', 'inspect', '--format', '{{.Image}}', CONTAINER]) == IMAGE
gate = json.loads((WORK / 'manifest.json').read_text())
for name, expected in gate.items():
    path = (WORK / name).resolve(strict=True)
    assert path.is_relative_to(WORK)
    assert hashlib.sha256(path.read_bytes()).hexdigest() == expected, name

if sys.argv[1] == '--prepare':
    assert not RELEASE.exists()
    run(['docker', 'tag', IMAGE, 'bnbu-backend-production:aoksend-base-20260915'])
    for path in (WORK / 'backend/dist').rglob('*'):
        os.chmod(path, 0o755 if path.is_dir() else 0o644)
    run(['docker', 'build', '--pull=false', '-t', TAG, str(WORK / 'backend')])
    run(['docker', 'run', '--rm', '--network', 'none', '--read-only', '--entrypoint', 'node', TAG,
         '--input-type=module', '-e', "await import('reflect-metadata');await import('./dist/modules/client-capabilities/client-capabilities.module.js');await import('./dist/common/config/file-json-secret-loader.js');"])
    (WORK / 'prepared.json').write_text(json.dumps({'image': out(['docker','image','inspect','--format','{{.Id}}',TAG])}))
    print('PREPARED')
    raise SystemExit

prepared = json.loads((WORK / 'prepared.json').read_text())
assert out(['docker','image','inspect','--format','{{.Id}}',TAG]) == prepared['image']
assert not RELEASE.exists()
secret = Path('/etc/bnbu-sports-production/secrets/runtime-aoksend-20260915.json')
assert secret.exists() and secret.stat().st_mode & 0o007 == 0
assert json.loads(secret.read_text()).get('AOKSEND_APP_KEY')
shutil.copytree(PREVIOUS, RELEASE)
env = RELEASE / '.env'
content, count = re.subn(r'(?m)^BACKEND_IMAGE=.*$', 'BACKEND_IMAGE='+prepared['image'], env.read_text())
assert count == 1
env.write_text(content)
mail = Path('/etc/bnbu-sports-production/mail.env').read_text()
mail = re.sub(r'(?m)^(EMAIL_DELIVERY_PROVIDER|AOKSEND_TEMPLATE_ID|AOKSEND_TIMEOUT_MS)=.*\n?', '', mail)
mail += '\nEMAIL_DELIVERY_PROVIDER=AOKSEND\nAOKSEND_TEMPLATE_ID=E_154193113758\nAOKSEND_TIMEOUT_MS=5000\n'
(RELEASE / 'mail.env').write_text(mail)
os.chmod(RELEASE / 'mail.env', 0o600)
compose = (RELEASE / 'compose.yml').read_text()
old_mail = '/etc/bnbu-sports-production/mail.env'
old_secret = '/etc/bnbu-sports-production/secrets/runtime.json:/run/secrets/runtime.json:ro'
assert compose.count(old_mail) == 1 and compose.count(old_secret) == 1
compose = compose.replace(old_mail, str(RELEASE / 'mail.env')).replace(old_secret, str(secret)+':/run/secrets/runtime.json:ro')
(RELEASE / 'compose.yml').write_text(compose)
try:
    start(RELEASE)
    assert out(['docker','exec',CONTAINER,'printenv','EMAIL_DELIVERY_PROVIDER']) == 'AOKSEND'
    assert out(['docker','exec',CONTAINER,'printenv','AOKSEND_TEMPLATE_ID']) == 'E_154193113758'
    for name, digest in gate.items():
        if name.startswith('backend/dist/'):
            remote = '/app/'+name[len('backend/'):]
            assert out(['docker','exec',CONTAINER,'sha256sum',remote]).split()[0] == digest
    switch(RELEASE)
    with urllib.request.urlopen('https://www.student.bnbusports.cn/api/v1/health/ready',timeout=15) as response:
        assert response.status == 200
    result = {'result':'DEPLOYED','release':str(RELEASE),'previous':str(PREVIOUS),'image':prepared['image'],
              'provider':'AOKSEND','templateId':'E_154193113758','fallback':'TENCENT_SES','health':'PASS','migrationExecuted':False}
    (WORK / 'deployment-result.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result))
except Exception:
    start(PREVIOUS)
    if (BASE / 'current').resolve() != PREVIOUS:
        switch(PREVIOUS)
    print('FAILED_ROLLED_BACK')
    raise
