"""Deploy two validated static modules, retaining all runtime configuration."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import urllib.request

assert os.geteuid() == 0
base=Path('/opt/bnbu-sports-production')
previous=base/'releases/student-live-camera-20260913'
release=base/'releases/student-receipt-20260913'
work=Path('/home/ubuntu/bnbu-student-receipt-20260913')
assert (base/'current').resolve()==previous and not release.exists()
gate=json.loads((work/'validation.json').read_text())
assert gate['sourceCommit'].startswith('7009e6a2')
assert set(gate['files'])=={'screens/checkin.js'}
for name,digest in gate['files'].items():
    assert hashlib.sha256((work/Path(name).name).read_bytes()).hexdigest()==digest
shutil.copytree(previous,release)
for name in gate['files']:
    shutil.copyfile(work/Path(name).name,release/'web/student/js'/name)
for name in ['.env','production.env','compose.yml','nginx.conf']:
    assert (previous/name).read_bytes()==(release/name).read_bytes()
def switch(target):
    link=base/'student-recognition-current-tmp'
    assert not link.exists() and not link.is_symlink()
    link.symlink_to(target)
    os.replace(link,base/'current')
try:
    switch(release)
    for name,digest in gate['files'].items():
        with urllib.request.urlopen('https://www.student.bnbusports.cn/student/js/'+name+'?acceptance=record-minutes',timeout=20) as response:
            assert response.status==200 and hashlib.sha256(response.read()).hexdigest()==digest
    print(json.dumps({'check':'STUDENT_RECEIPT_DEPLOYMENT','result':'PASS','release':release.name,'previous':previous.name,'sourceCommit':gate['sourceCommit'],'files':gate['files']}))
except Exception:
    switch(previous)
    raise
