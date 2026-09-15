"""Preserve existing email image URLs independently of website release switches."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import urllib.request

CONFIG = Path('/etc/nginx/sites-available/verityai.conf')
BACKUP = Path('/etc/nginx/sites-available/verityai.conf.before-mail-assets-20260915')
SOURCE = Path('/var/www/verityai/current/email-assets/20260915')
TARGET = Path('/var/www/verityai/shared/email-assets/20260915')
HASHES = {
    'email-57d1d49839f323d0.png': '57d1d49839f323d09ab695b8ad079d1e15176fc4030531b8b45f80cf2d0e8e45',
    'email-6fbcbc9ddebe7223.png': '6fbcbc9ddebe72233c298076849739a1080b1628d33758b6db5b9885927b7fb4',
    'email-b2e40b8fd8a487cf.jpg': 'b2e40b8fd8a487cf22055afbc1c669f1666014c55d91f0bc9304a4b6351a829f',
}

def run(args):
    subprocess.run(args, check=True)

def digest(data):
    return hashlib.sha256(data).hexdigest()

assert os.geteuid() == 0
original = CONFIG.read_bytes()
anchor = '    location ~ /\\. { deny all; }'
text = original.decode()
assert text.count(anchor) == 1 and 'location ^~ /email-assets/' not in text
assert not BACKUP.exists() or BACKUP.read_bytes() == original
for name, expected in HASHES.items():
    assert digest((SOURCE / name).read_bytes()) == expected
TARGET.mkdir(parents=True, exist_ok=True)
for directory in [TARGET.parent.parent, TARGET.parent, TARGET]:
    os.chmod(directory, 0o755)
for name, expected in HASHES.items():
    destination = TARGET / name
    if destination.exists():
        assert digest(destination.read_bytes()) == expected
    else:
        shutil.copyfile(SOURCE / name, destination)
    os.chmod(destination, 0o644)
block = '''    location ^~ /email-assets/ {
        alias /var/www/verityai/shared/email-assets/;
        autoindex off;
        add_header X-Content-Type-Options nosniff always;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
'''
if not BACKUP.exists():
    shutil.copy2(CONFIG, BACKUP)
try:
    CONFIG.write_text(text.replace(anchor, block + anchor))
    run(['nginx', '-t'])
    run(['systemctl', 'reload', 'nginx'])
    verified = []
    for name, expected in HASHES.items():
        url = 'https://verityai.cn/email-assets/20260915/' + name
        for attempt in range(10):
            with urllib.request.urlopen(url, timeout=20) as response:
                assert response.status == 200
                assert digest(response.read()) == expected
                if 'immutable' in response.headers.get('Cache-Control', ''):
                    verified.append({'url': url, 'sha256': expected, 'httpStatus': response.status})
                    break
            time.sleep(0.5)  # Graceful nginx reload can briefly serve the old worker config.
        else:
            raise RuntimeError('New asset route was not observed after reload')
    print(json.dumps({'result': 'PASS', 'directory': str(TARGET),
                      'nginxBackup': str(BACKUP), 'assets': verified}))
except Exception:
    CONFIG.write_bytes(original)
    run(['nginx', '-t'])
    run(['systemctl', 'reload', 'nginx'])
    raise
