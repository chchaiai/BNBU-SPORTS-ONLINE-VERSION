"""Publish the verified record display corrections with service rollback."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import time
import urllib.request

if os.geteuid() != 0:
    raise SystemExit('Run as root on the intended production host')
work = Path('/home/ubuntu/bnbu-bugfix-round2-20260910')
base = Path('/opt/bnbu-sports-production')
previous = base / 'releases/481f163a959e-round2'
release = base / 'releases/2d4a49cabd79-round2'
gate = json.loads((work / 'record-display-validation.json').read_text())
if gate['status'] != 'PASS' or gate['sourceCommit'] != '2d4a49cabd79a9d7b40eef1984334152e07b70c8':
    raise SystemExit('Unexpected source or validation')
if (base / 'current').resolve() != previous or release.exists():
    raise SystemExit('Unexpected current release or existing destination')

def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()

original = work / 'bugfix-release-images.tar.gz'
delta = work / 'record-display-delta.tar.gz'
original_gate = json.loads((work / 'local-validation.json').read_text())
if sha(original) != original_gate['artifacts'][original.name] or sha(delta) != gate['deltaSha256']:
    raise SystemExit('Image archive integrity check failed')
# Reuse content-addressed OCI blobs already transferred for the previous release.
# New metadata and changed blobs come from the verified docker-save delta.
combined = work / 'record-display-combined.tar'
with tarfile.open(delta, 'r:gz') as new, tarfile.open(original, 'r:gz') as old, tarfile.open(combined, 'x') as out:
    replaced = {m.name for m in new.getmembers()}
    for member in old:
        if member.isfile() and member.name.startswith('blobs/') and member.name not in replaced:
            out.addfile(member, old.extractfile(member))
    for member in new:
        if member.isfile():
            out.addfile(member, new.extractfile(member))

def run(args):
    subprocess.run(args, check=True)

run(['docker', 'load', '-i', str(combined)])
tag = 'bnbu-portal-production:2d4a49ca-round2'
actual = subprocess.check_output(['docker', 'image', 'inspect', '--format', '{{.Id}}', tag], text=True).strip()
if actual != gate['imageId']:
    raise SystemExit('Loaded image does not match the locally validated image')
for relative, checksum in gate['studentFiles'].items():
    if relative not in ('js/api.js', 'js/screens/checkin.js') or sha(work / 'record-display-student' / relative) != checksum:
        raise SystemExit('Student module checksum or path mismatch')
shutil.copytree(previous, release)
for relative in gate['studentFiles']:
    shutil.copyfile(work / 'record-display-student' / relative, release / 'web/student' / relative)
environment = release / '.env'
text = environment.read_text()
old_tag = 'PORTAL_IMAGE=bnbu-portal-production:fad4083c-round2'
if text.count(old_tag) != 1:
    raise SystemExit('Unexpected portal image configuration')
environment.write_text(text.replace(old_tag, 'PORTAL_IMAGE=' + tag))

def switch(target):
    link = base / 'current-round2-record-tmp'
    if link.exists() or link.is_symlink():
        raise RuntimeError('Unexpected temporary symlink')
    link.symlink_to(target)
    os.replace(link, base / 'current')

try:
    run(['docker', 'compose', '--project-directory', str(release), 'up', '-d', '--no-build', '--pull', 'never', 'portal'])
    for attempt in range(90):
        status = subprocess.check_output(['docker', 'inspect', '--format', '{{.State.Health.Status}}', 'bnbu-sports-production-portal-1'], text=True).strip()
        if status == 'healthy':
            break
        time.sleep(1)
    else:
        raise RuntimeError('Portal health check failed')
    with urllib.request.urlopen('https://www.teacher.bnbusports.cn/', timeout=20) as response:
        if response.status != 200:
            raise RuntimeError('Public portal health failed')
    switch(release)
    for relative, checksum in gate['studentFiles'].items():
        with urllib.request.urlopen('https://www.student.bnbusports.cn/student/' + relative + '?acceptance=2d4a49ca', timeout=30) as response:
            if response.status != 200 or hashlib.sha256(response.read()).hexdigest() != checksum:
                raise RuntimeError('Public student module checksum mismatch')
    print(json.dumps({'check': 'RECORD_DISPLAY_DEPLOYMENT', 'result': 'PASS', 'release': str(release), 'imageId': actual}))
except Exception:
    if (base / 'current').resolve() != previous:
        switch(previous)
    run(['docker', 'compose', '--project-directory', str(previous), 'up', '-d', '--no-build', '--pull', 'never', 'portal'])
    print(json.dumps({'check': 'RECORD_DISPLAY_DEPLOYMENT', 'result': 'FAILED_ROLLED_BACK'}))
    raise
