import os
import subprocess
from pathlib import Path
assert os.geteuid() == 0
base = Path('/opt/bnbu-sports-production')
assert (base / 'current').resolve().name == 'invite-ui-final-20260913'
image = subprocess.check_output(['docker', 'inspect', '--format', '{{.Image}}', 'bnbu-sports-production-backend-1'], text=True).strip()
assert image == 'sha256:c676a33218fc069cc6c57a14d36a96420bfeb8bb36facb84939cff8826b68055'
directory = Path('/home/ubuntu/notification-diagnostic-20260913')
directory.mkdir(mode=0o700, exist_ok=True)
os.chown(directory, 10001, 10001)
subprocess.run(['docker', 'run', '--rm', '--network', 'host', '--read-only', '--tmpfs', '/tmp', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '10001:10001', '--group-add', '10001', '--env-file', str(base / 'current/production.env'), '--env-file', '/etc/bnbu-sports-production/mail.env', '-v', '/etc/bnbu-sports-production/secrets/runtime.json:/run/secrets/runtime.json:ro', '-v', '/etc/bnbu-sports-production/secrets/tencentdb-ca-chain.pem:/run/secrets/tencentdb-ca-chain.pem:ro', '-v', str(directory)+':/acceptance', '-v', '/home/ubuntu/ocr-notification-diagnostic.mjs:/app/ocr-notification-diagnostic.mjs:ro', '--entrypoint', 'node', image, '/app/ocr-notification-diagnostic.mjs'], check=True)
