"""Publish the verified student progress module; preserve runtime configuration."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import urllib.request

if os.geteuid() != 0:
    raise SystemExit('Run as root on the intended production host')
base = Path('/opt/bnbu-sports-production')
work = Path('/home/ubuntu/bnbu-bugfix-round2-20260910')
previous = base / 'releases/fad4083c023f-round2'
release = base / 'releases/481f163a959e-round2'
gate = json.loads((work / 'progress-validation.json').read_text())
if gate['sourceCommit'] != '481f163a959ebc1600c90022f927b3d4bde05cc8' or gate['localResult'] != 'PASS':
    raise SystemExit('Unexpected source or local validation')
if (base / 'current').resolve() != previous or release.exists():
    raise SystemExit('Unexpected current release or existing destination')
source = work / 'grades.js'
digest = hashlib.sha256(source.read_bytes()).hexdigest()
if digest != gate['sha256']:
    raise SystemExit('Source checksum mismatch')
relative = Path('web/student/js/screens/grades.js')
if not (previous / relative).is_file():
    raise SystemExit('Expected student module missing')
shutil.copytree(previous, release)
shutil.copyfile(source, release / relative)
for item in ('.env', 'production.env', 'compose.yaml'):
    if (previous / item).exists() and (previous / item).read_bytes() != (release / item).read_bytes():
        raise SystemExit('Runtime configuration changed')

def switch(target):
    link = base / 'current-progress-tmp'
    if link.exists() or link.is_symlink():
        raise RuntimeError('Unexpected temporary symlink')
    link.symlink_to(target)
    os.replace(link, base / 'current')

try:
    switch(release)
    url = 'https://www.student.bnbusports.cn/student/js/screens/grades.js?acceptance=481f163a'
    with urllib.request.urlopen(url, timeout=30) as response:
        if response.status != 200 or hashlib.sha256(response.read()).hexdigest() != digest:
            raise RuntimeError('Public module checksum mismatch')
    print(json.dumps({'check': 'STUDENT_PROGRESS_STATIC_DEPLOYMENT', 'result': 'PASS',
                      'release': str(release), 'previous': str(previous),
                      'sourceCommit': gate['sourceCommit'], 'sha256': digest}))
except Exception:
    switch(previous)
    print(json.dumps({'check': 'STUDENT_PROGRESS_STATIC_DEPLOYMENT', 'result': 'FAILED_ROLLED_BACK'}))
    raise
