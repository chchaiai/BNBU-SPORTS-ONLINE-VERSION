"""Publish the validated student invitation modules with atomic rollback."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import urllib.request

if os.geteuid() != 0:
    raise SystemExit('Run as root on the intended production host')
base = Path('/opt/bnbu-sports-production')
work = Path('/home/ubuntu/bnbu-bugfix-round2-20260910/continuity-package')
previous = base / 'releases/c4aa735dd5a3-continuity'
release = base / 'releases/3957d4249031-continuity'
gate = json.loads((work / 'validation.json').read_text())
expected = {'js/app.js', 'js/checkin-drafts.js', 'js/screens/checkin.js'}
if gate['sourceCommit'] != '3957d4249031d68027158f98cf0f7c912ca5c159' or gate['localResult'] != 'PASS' or set(gate['files']) != expected:
    raise SystemExit('Unexpected source, file scope, or local validation')
if (base / 'current').resolve() != previous or release.exists():
    raise SystemExit('Unexpected current release or existing destination')
for name, digest in gate['files'].items():
    if hashlib.sha256((work / name).read_bytes()).hexdigest() != digest:
        raise SystemExit('Source checksum mismatch')
    if name != 'js/checkin-drafts.js' and not (previous / 'web/student' / name).is_file():
        raise SystemExit('Expected student module missing')
shutil.copytree(previous, release)
for name in expected:
    shutil.copyfile(work / name, release / 'web/student' / name)
for item in ('.env', 'production.env', 'compose.yml', 'nginx.conf'):
    if (previous / item).read_bytes() != (release / item).read_bytes():
        raise SystemExit('Runtime configuration changed')

def switch(target):
    link = base / 'current-continuity-tmp'
    if link.exists() or link.is_symlink():
        raise RuntimeError('Unexpected temporary symlink')
    link.symlink_to(target)
    os.replace(link, base / 'current')

try:
    switch(release)
    for name, digest in gate['files'].items():
        url = 'https://www.student.bnbusports.cn/student/' + name + '?acceptance=3957d424'
        with urllib.request.urlopen(url, timeout=30) as response:
            if response.status != 200 or hashlib.sha256(response.read()).hexdigest() != digest:
                raise RuntimeError('Public module checksum mismatch')
    print(json.dumps({'check': 'CHECKIN_CONTINUITY_DEPLOYMENT', 'result': 'PASS',
                      'release': str(release), 'previous': str(previous),
                      'sourceCommit': gate['sourceCommit'], 'files': gate['files']}))
except Exception:
    switch(previous)
    print(json.dumps({'check': 'CHECKIN_CONTINUITY_DEPLOYMENT', 'result': 'FAILED_ROLLED_BACK'}))
    raise
