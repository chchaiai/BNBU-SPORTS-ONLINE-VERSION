"""Activate the approved AoKSend template on the inspected production release."""
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request

RELEASE = Path('/opt/bnbu-sports-production/releases/student-email-domain-20260915')
IMAGE = 'sha256:f67f7a5d177424d0bbd3dde8aac15bea90452e5c90e949b7c98a3a124e5a1e4c'
CONTAINER = 'bnbu-sports-production-backend-1'
OLD_ENV = '/opt/bnbu-sports-production/releases/aoksend-mail-20260915/mail.env'
NEW_ENV = RELEASE / 'mail-approved-20260915.env'
COMPOSE = RELEASE / 'compose.yml'
BACKUP = RELEASE / 'compose.before-approved-mail-20260915.yml'

def out(args):
    return subprocess.check_output(args, text=True).strip()

def start():
    subprocess.run(['docker', 'compose', '--project-directory', str(RELEASE),
                    'up', '-d', '--no-build', '--pull', 'never', 'backend'], check=True)
    for _ in range(60):
        if out(['docker', 'inspect', '--format', '{{.State.Health.Status}}', CONTAINER]) == 'healthy':
            return
        time.sleep(1)
    raise RuntimeError('Health timeout')

assert os.geteuid() == 0
assert Path('/opt/bnbu-sports-production/current').resolve() == RELEASE
assert out(['docker', 'inspect', '--format', '{{.Image}}', CONTAINER]) == IMAGE
assert not NEW_ENV.exists() and not BACKUP.exists()
original = COMPOSE.read_bytes()
assert original.decode().count(OLD_ENV) == 1
mail = Path(OLD_ENV).read_text()
old = 'AOKSEND_TEMPLATE_ID=E_154193113758'
assert mail.count(old) == 1
NEW_ENV.write_text(mail.replace(old, 'AOKSEND_TEMPLATE_ID=E_154198061747'))
os.chmod(NEW_ENV, 0o600)
BACKUP.write_bytes(original)
os.chmod(BACKUP, 0o600)
try:
    COMPOSE.write_text(original.decode().replace(OLD_ENV, str(NEW_ENV)))
    start()
    assert out(['docker', 'exec', CONTAINER, 'printenv', 'AOKSEND_TEMPLATE_ID']) == 'E_154198061747'
    assert out(['docker', 'exec', CONTAINER, 'printenv', 'EMAIL_DELIVERY_PROVIDER']) == 'AOKSEND'
    assert out(['docker', 'inspect', '--format', '{{.Image}}', CONTAINER]) == IMAGE
    with urllib.request.urlopen('https://www.student.bnbusports.cn/api/v1/health/ready', timeout=15) as response:
        assert response.status == 200
    print(json.dumps({'result': 'PASS', 'release': str(RELEASE), 'image': IMAGE,
                      'templateId': 'E_154198061747', 'fallbackTemplateId': '56852',
                      'health': 'PASS', 'migrationExecuted': False}))
except Exception:
    COMPOSE.write_bytes(original)
    start()
    raise
