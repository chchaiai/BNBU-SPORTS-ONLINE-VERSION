"""Apply a verified student static overlay and retain the previous release."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import urllib.request

base = Path('/opt/bnbu-sports-production')
work = Path('/home/ubuntu/bnbu-iphone-video-20260915')
previous = base / 'releases/profile-quality-20260915'
release = base / 'releases/iphone-video-20260915-r2'
nginx = Path('/etc/nginx/sites-available/bnbu-staging-hk.conf')
gate = json.loads((work / 'validation.json').read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
assert os.geteuid() == 0
assert (base / 'current').resolve() == previous and not release.exists()
assert gate['checks'] == {'unit': 14, 'conversion': 'PASS', 'browser': 'PASS', 'backendValidator': 5}
assert sha(nginx) == gate['nginx'] == sha(previous / 'nginx.conf')
for name, expected in gate['baseline'].items():
    assert sha(previous / 'web/student' / name) == expected, name
for name, expected in gate['files'].items():
    assert sha(work / 'student' / name) == expected, name
backend_before = subprocess.check_output(['docker', 'inspect', '--format', '{{.Image}} {{.State.Health.Status}}', 'bnbu-sports-production-backend-1'], text=True).strip()
assert backend_before.endswith(' healthy')
shutil.copytree(previous, release)
for name in gate['files']:
    shutil.copyfile(work / 'student' / name, release / 'web/student' / name)
text = (previous / 'nginx.conf').read_text()
anchor = '    location ^~ /student/vendor/ffmpeg/ {'
assert text.count(anchor) == 1
text = text.replace(anchor, '''    location = /student/vendor/ffmpeg/core/ffmpeg-core.wasm {
        types { }
        default_type application/wasm;
        add_header X-Content-Type-Options nosniff always;
        add_header Cache-Control "public, max-age=2592000" always;
        try_files $uri =404;
    }
''' + anchor)
(release / 'nginx.conf').write_text(text)

def switch(target):
    temporary = base / 'current-iphone-video-tmp'
    assert not temporary.exists() and not temporary.is_symlink()
    temporary.symlink_to(target)
    os.replace(temporary, base / 'current')

def install_nginx(source):
    temporary = nginx.with_name('bnbu-staging-hk.iphone-video-tmp')
    shutil.copyfile(source, temporary)
    os.replace(temporary, nginx)

try:
    # Recheck just before switching, preserving concurrent deployments.
    assert (base / 'current').resolve() == previous
    switch(release)
    install_nginx(release / 'nginx.conf')
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    for name, expected in gate['files'].items():
        with urllib.request.urlopen('https://www.student.bnbusports.cn/student/' + name + '?verify=iphone-20260915', timeout=30) as response:
            assert response.status == 200 and hashlib.sha256(response.read()).hexdigest() == expected, name
    content_types = []
    # nginx reload is asynchronous: wait for the new workers to serve headers.
    for attempt in range(10):
        with urllib.request.urlopen(urllib.request.Request('https://www.student.bnbusports.cn/student/vendor/ffmpeg/core/ffmpeg-core.wasm?v=9f57947a5bd5-iphone-20260915', method='HEAD'), timeout=20) as response:
            content_types.append(response.headers.get_content_type())
        if content_types[-1] == 'application/wasm':
            break
        time.sleep(1)
    assert content_types[-1] == 'application/wasm', content_types
    backend_after = subprocess.check_output(['docker', 'inspect', '--format', '{{.Image}} {{.State.Health.Status}}', 'bnbu-sports-production-backend-1'], text=True).strip()
    assert backend_after == backend_before
    result = {'result':'PASS','release':str(release),'previous':str(previous),'files':gate['files'],'wasmContentType':'application/wasm','observedContentTypes':content_types,'backend':backend_after}
    (work / 'deployment.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))
except Exception:
    if (base / 'current').resolve() == release:
        switch(previous)
        install_nginx(previous / 'nginx.conf')
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    raise
