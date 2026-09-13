import os
from pathlib import Path
import subprocess
import sys

assert os.geteuid() == 0 and sys.argv[1:] in [['--dry-run'], ['--apply']]
base = Path('/opt/bnbu-sports-production')
assert (base / 'current').resolve().name == 'notification-locale-20260913'
image = subprocess.check_output(['docker', 'inspect', '--format', '{{.Image}}', 'bnbu-sports-production-backend-1'], text=True).strip()
assert image == 'sha256:59eedded13c53c0c7a93ea71083e9f9eabe7532cc12041bbae2a0e6957c0fc9b'
subprocess.run(['docker', 'run', '--rm', '--network', 'host', '--read-only', '--tmpfs', '/tmp', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '10001:10001', '--group-add', '10001', '--env-file', str(base / 'current/production.env'), '--env-file', '/etc/bnbu-sports-production/mail.env', '-v', '/etc/bnbu-sports-production/secrets/runtime.json:/run/secrets/runtime.json:ro', '-v', '/etc/bnbu-sports-production/secrets/tencentdb-ca-chain.pem:/run/secrets/tencentdb-ca-chain.pem:ro', '-v', '/home/ubuntu/backfill-notification-history.mjs:/app/backfill-notification-history.mjs:ro', '--entrypoint', 'node', image, '/app/backfill-notification-history.mjs', sys.argv[1]], check=True)
