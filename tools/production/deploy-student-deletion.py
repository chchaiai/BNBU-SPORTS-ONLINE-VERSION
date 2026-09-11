"""Deploy the verified student deletion command and portal, retaining runtime settings."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import time
import urllib.request

work=Path('/home/ubuntu/bnbu-bugfix-round2-20260910')
base=Path('/opt/bnbu-sports-production')
archives=[work/'closure-combined.tar',work/'bugfix-release-images.tar.gz']
if sys.argv[1:] == ['--inventory']:
    names=set()
    for archive in archives:
        with tarfile.open(archive) as source:
            names.update(item.name for item in source if item.isfile() and item.name.startswith('blobs/sha256/'))
    (work/'student-deletion-base-blobs.json').write_text(json.dumps(sorted(names)))
    print(json.dumps({'check':'EXISTING_IMAGE_BLOBS','count':len(names)}))
    raise SystemExit(0)
assert sys.argv[1:] == ['--apply'] and os.geteuid()==0
previous=base/'releases/f87dba74f39d-closure'
release=base/'releases/e4bd83eb4b5f-student-delete'
gate=json.loads((work/'student-deletion-validation.json').read_text())
assert gate['status']=='PASS' and gate['sourceCommit']=='e4bd83eb4b5f8824c82de430ba614f5adcff7195'
assert (base/'current').resolve()==previous and not release.exists()
def digest(stream):
    result=hashlib.sha256()
    for chunk in iter(lambda:stream.read(1024*1024),b''):result.update(chunk)
    return result.hexdigest()
delta=work/'student-deletion-delta.tar.gz'
with delta.open('rb') as source:assert digest(source)==gate['deltaSha256']
combined=work/'student-deletion-combined.tar'
with tarfile.open(combined,'x') as output:
    seen=set()
    for archive in [delta,*archives]:
        with tarfile.open(archive) as source:
            for item in source:
                if not item.isfile() or item.name in seen:continue
                if archive!=delta and not item.name.startswith('blobs/sha256/'):continue
                if item.name.startswith('blobs/sha256/'):
                    assert digest(source.extractfile(item))==item.name.rsplit('/',1)[1]
                output.addfile(item,source.extractfile(item));seen.add(item.name)
def run(args):subprocess.run(args,check=True)
run(['docker','load','-i',str(combined)])
for service in ['backend','portal','migrator']:
    tag=f'bnbu-{service}-production:e4bd83eb-student-delete'
    assert subprocess.check_output(['docker','image','inspect','--format','{{.Id}}',tag],text=True).strip()==gate['images'][service]
run(['python3',str(work/'backup-before-bugfix.py')])
shutil.copytree(previous,release)
env=release/'.env';content=env.read_text()
for service,old in [('BACKEND','f87dba74-closure'),('PORTAL','f87dba74-closure'),('MIGRATOR','27f9f25a-round2')]:
    before=f'{service}_IMAGE=bnbu-{service.lower()}-production:{old}'
    assert content.count(before)==1
    content=content.replace(before,f'{service}_IMAGE=bnbu-{service.lower()}-production:e4bd83eb-student-delete')
env.write_text(content)
for name in ['production.env','compose.yml']:
    assert (release/name).read_bytes()==(previous/name).read_bytes()
def switch(target):
    link=base/'current-student-deletion-tmp';assert not link.exists() and not link.is_symlink()
    link.symlink_to(target);os.replace(link,base/'current')
try:
    run(['docker','compose','--project-directory',str(release),'--profile','migration','run','--rm','migrator'])
    run(['docker','compose','--project-directory',str(release),'up','-d','--no-build','--pull','never','backend','portal'])
    for attempt in range(90):
        states=[subprocess.check_output(['docker','inspect','--format','{{.State.Health.Status}}',f'bnbu-sports-production-{service}-1'],text=True).strip() for service in ['backend','portal']]
        if states==['healthy','healthy']:break
        time.sleep(1)
    else:raise RuntimeError('New services did not become healthy')
    for url in ['https://www.teacher.bnbusports.cn/','https://www.student.bnbusports.cn/api/v1/health/ready']:
        with urllib.request.urlopen(url,timeout=20) as response:assert response.status==200
    switch(release)
    print(json.dumps({'check':'STUDENT_DELETION_DEPLOYMENT','result':'PASS','release':str(release),'images':gate['images']}))
except Exception:
    if (base/'current').resolve()!=previous:switch(previous)
    run(['docker','compose','--project-directory',str(previous),'up','-d','--no-build','--pull','never','backend','portal'])
    print(json.dumps({'check':'STUDENT_DELETION_DEPLOYMENT','result':'FAILED_APPLICATION_ROLLED_BACK','database':'Additive migration retained; no automatic data restore'}))
    raise
