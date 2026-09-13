"""Deploy verified teacher media previews and notifications; retain backend and runtime."""
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
archives=[work/'teacher-preview-combined.tar']
if sys.argv[1:] == ['--inventory']:
    names=set()
    for archive in archives:
        with tarfile.open(archive) as source:
            names.update(item.name for item in source if item.isfile() and item.name.startswith('blobs/sha256/'))
    (work/'teacher-preview-base-blobs.json').write_text(json.dumps(sorted(names)))
    print(json.dumps({'check':'EXISTING_IMAGE_BLOBS','count':len(names)}))
    raise SystemExit(0)
assert sys.argv[1:] == ['--apply'] and os.geteuid()==0
previous=base/'releases/teacher-preview-20260911'
release=base/'releases/teacher-media-20260911'
gate=json.loads((work/'teacher-media-validation.json').read_text())
assert gate['status']=='PASS' and gate['sourceCommit']=='bd4402e8cc631413ef3e2f4c3abc78f1cdf966b6'
assert (base/'current').resolve()==previous and not release.exists()
def digest(stream):
    result=hashlib.sha256()
    for chunk in iter(lambda:stream.read(1024*1024),b''):result.update(chunk)
    return result.hexdigest()
delta=work/'teacher-media-delta.tar.gz'
with delta.open('rb') as source:assert digest(source)==gate['deltaSha256']
combined=work/'teacher-media-combined.tar'
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
for service in ['portal']:
    tag=f'bnbu-{service}-production:teacher-media-20260911'
    assert subprocess.check_output(['docker','image','inspect','--format','{{.Id}}',tag],text=True).strip()==gate['images'][service]

shutil.copytree(previous,release)
env=release/'.env';content=env.read_text()
for service,old in [('PORTAL','teacher-preview-20260911')]:
    before=f'{service}_IMAGE=bnbu-{service.lower()}-production:{old}'
    assert content.count(before)==1
    content=content.replace(before,f'{service}_IMAGE=bnbu-{service.lower()}-production:teacher-media-20260911')
env.write_text(content)
for name in ['production.env','compose.yml']:
    assert (release/name).read_bytes()==(previous/name).read_bytes()
def switch(target):
    link=base/'current-teacher-preview-tmp';assert not link.exists() and not link.is_symlink()
    link.symlink_to(target);os.replace(link,base/'current')
try:
    run(['docker','compose','--project-directory',str(release),'up','-d','--no-build','--pull','never','--no-deps','portal'])
    for attempt in range(90):
        states=[subprocess.check_output(['docker','inspect','--format','{{.State.Health.Status}}',f'bnbu-sports-production-{service}-1'],text=True).strip() for service in ['portal']]
        if states==['healthy']:break
        time.sleep(1)
    else:raise RuntimeError('New services did not become healthy')
    for url in ['https://www.teacher.bnbusports.cn/','https://www.student.bnbusports.cn/api/v1/health/ready']:
        with urllib.request.urlopen(url,timeout=20) as response:assert response.status==200
    switch(release)
    print(json.dumps({'check':'TEACHER_MEDIA_DEPLOYMENT','result':'PASS','release':str(release),'images':gate['images']}))
except Exception:
    if (base/'current').resolve()!=previous:switch(previous)
    run(['docker','compose','--project-directory',str(previous),'up','-d','--no-build','--pull','never','--no-deps','portal'])
    print(json.dumps({'check':'TEACHER_MEDIA_DEPLOYMENT','result':'FAILED_APPLICATION_ROLLED_BACK','database':'No database migration performed'}))
    raise
