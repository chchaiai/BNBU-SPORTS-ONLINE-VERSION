"""Apply user-approved A, preserving the current release and log policy."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import urllib.request

assert os.geteuid() == 0
base = Path('/opt/bnbu-sports-production')
previous = base / 'releases/portal-feedback-labels-20260913'
release = base / 'releases/ocr-entry-approved-20260913'
assert (base / 'current').resolve() == previous and not release.exists()
site = Path('/etc/nginx/sites-enabled/bnbu-staging-hk.conf').resolve(strict=True)
original = site.read_bytes()
text = original.decode()
start = text.index('    server_name www.teacher.bnbusports.cn;')
position = text.index('    location /api/v1/ {', start)
end = text.index('\n    }', position) + len('\n    }')
block = text[position:end]
assert 'client_max_body_size 2m;' in block and 'access_log off;' in block
special = block.replace('location /api/v1/', 'location ~ "^/api/v1/class-sections/[0-9a-fA-F-]{36}/ocr-(roster|physical)-batches$"').replace('client_max_body_size 2m;', 'client_max_body_size 101m;\n        proxy_request_buffering off;')
updated = (text[:position] + special + '\n' + text[position:]).encode()
backup = base / 'backups/nginx-before-ocr-entry-20260913.conf'
assert not backup.exists()
backup.write_bytes(original)
backup.chmod(0o600)
shutil.copytree(previous, release)
(release / 'nginx.conf').write_bytes(updated)

def switch(target):
    link = base / 'current-ocr-entry-tmp'
    assert not link.exists() and not link.is_symlink()
    link.symlink_to(target)
    os.replace(link, base / 'current')

try:
    site.write_bytes(updated)
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    for url in ['https://www.teacher.bnbusports.cn/', 'https://www.student.bnbusports.cn/student/', 'https://www.student.bnbusports.cn/api/v1/health/ready']:
        with urllib.request.urlopen(url, timeout=20) as response:
            assert response.status == 200
    switch(release)
    print(json.dumps({'result': 'PASS', 'change': 'A', 'previous': str(previous), 'release': str(release), 'backup': str(backup), 'beforeSha256': hashlib.sha256(original).hexdigest(), 'afterSha256': hashlib.sha256(updated).hexdigest(), 'logPolicy': 'preserved access_log off', 'largeFileRegression': 'PENDING'}))
except Exception:
    site.write_bytes(original)
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    if (base / 'current').resolve() != previous:
        switch(previous)
    raise
