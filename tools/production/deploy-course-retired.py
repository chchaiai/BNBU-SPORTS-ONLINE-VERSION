"""Publish the verified text-only portal correction with service rollback."""
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
work = Path('/home/ubuntu/bnbu-exercise-limits-20260912')
base = Path('/opt/bnbu-sports-production')
previous = base / 'releases/exercise-limits-20260912'
release = base / 'releases/course-retired-20260912'
gate = json.loads((work / 'course-retired-validation.json').read_text())
if gate['status'] != 'PASS' or not gate['sourceCommit'].startswith('a6c9795a'):
    raise SystemExit('Unexpected source or validation')
if (base / 'current').resolve() != previous or release.exists():
    raise SystemExit('Unexpected current release or existing destination')

def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()

original = work / 'images.tar.gz'
delta = work / 'course-retired-delta.tar.gz'
original_gate = gate
if sha(original) != original_gate['originalSha256'] or sha(delta) != gate['deltaSha256']:
    raise SystemExit('Image archive integrity check failed')
# Reuse content-addressed OCI blobs already transferred for the previous release.
# New metadata and changed blobs come from the verified docker-save delta.
combined = work / 'course-retired-combined.tar'
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
tag = 'bnbu-portal-production:course-retired-20260912'
actual = subprocess.check_output(['docker', 'image', 'inspect', '--format', '{{.Id}}', tag], text=True).strip()
if actual != gate['imageId']:
    raise SystemExit('Loaded image does not match the locally validated image')
shutil.copytree(previous, release)
environment = release / '.env'
text = environment.read_text()
old_tag = 'PORTAL_IMAGE=bnbu-portal-production:exercise-limits-20260912'
if text.count(old_tag) != 1:
    raise SystemExit('Unexpected portal image configuration')
environment.write_text(text.replace(old_tag, 'PORTAL_IMAGE=' + tag))

def switch(target):
    link = base / 'current-retired-tmp'
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
    print(json.dumps({'check': 'RETIRED_COURSE_PORTAL_DEPLOYMENT', 'result': 'PASS', 'release': str(release), 'imageId': actual}))
except Exception:
    if (base / 'current').resolve() != previous:
        switch(previous)
    run(['docker', 'compose', '--project-directory', str(previous), 'up', '-d', '--no-build', '--pull', 'never', 'portal'])
    print(json.dumps({'check': 'RETIRED_COURSE_PORTAL_DEPLOYMENT', 'result': 'FAILED_ROLLED_BACK'}))
    raise
