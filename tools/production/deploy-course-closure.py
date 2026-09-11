"""Deploy the locally verified course-closure fix, preserving the current runtime configuration."""
import hashlib,json,os,shutil,subprocess,tarfile,time,urllib.request
from pathlib import Path
assert os.geteuid()==0
work=Path('/home/ubuntu/bnbu-bugfix-round2-20260910');base=Path('/opt/bnbu-sports-production')
previous=base/'releases/3957d4249031-continuity';release=base/'releases/f87dba74f39d-closure'
gate=json.loads((work/'closure-validation.json').read_text())
assert gate['status']=='PASS' and gate['sourceCommit']=='f87dba74f39dc2ad7198a79d037e47ab8831c1d7'
assert (base/'current').resolve()==previous and not release.exists()
def digest_stream(f):
 h=hashlib.sha256()
 for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
def sha(p):
 with p.open('rb') as f:return digest_stream(f)
assert sha(work/'closure-delta.tar.gz')==gate['deltaSha256']
assert sha(work/'closure-checkin.js')==gate['studentSha256']
combined=work/'closure-combined.tar'
with tarfile.open(work/'closure-delta.tar.gz','r:gz') as new,tarfile.open(work/'record-display-combined.tar','r') as old,tarfile.open(combined,'x') as out:
 replaced={m.name for m in new.getmembers()};seen=set()
 for tar in [old,new]:
  for member in tar:
   if not member.isfile() or member.name in seen:continue
   if tar is old and (not member.name.startswith('blobs/') or member.name in replaced):continue
   if member.name.startswith('blobs/sha256/'):
    assert digest_stream(tar.extractfile(member))==member.name.rsplit('/',1)[1]
   out.addfile(member,tar.extractfile(member));seen.add(member.name)
def run(args):subprocess.run(args,check=True)
run(['docker','load','-i',str(combined)])
for service in ['backend','portal']:
 actual=subprocess.check_output(['docker','image','inspect','--format','{{.Id}}',f'bnbu-{service}-production:f87dba74-closure'],text=True).strip()
 assert actual==gate['images'][service]
run(['python3',str(work/'backup-before-bugfix.py')])
shutil.copytree(previous,release)
shutil.copyfile(work/'closure-checkin.js',release/'web/student/js/screens/checkin.js')
env=release/'.env';content=env.read_text()
for key,old,new in [('BACKEND_IMAGE','bnbu-backend-production:27f9f25a-round2','bnbu-backend-production:f87dba74-closure'),('PORTAL_IMAGE','bnbu-portal-production:2d4a49ca-round2','bnbu-portal-production:f87dba74-closure')]:
 assert content.count(key+'='+old)==1;content=content.replace(key+'='+old,key+'='+new)
env.write_text(content)
def switch(target):
 link=base/'current-course-closure-tmp';assert not link.exists() and not link.is_symlink();link.symlink_to(target);os.replace(link,base/'current')
try:
 run(['docker','compose','--project-directory',str(release),'up','-d','--no-build','--pull','never','backend','portal'])
 for attempt in range(90):
  states=[subprocess.check_output(['docker','inspect','--format','{{.State.Health.Status}}',f'bnbu-sports-production-{s}-1'],text=True).strip() for s in ['backend','portal']]
  if states==['healthy','healthy']:break
  time.sleep(1)
 else:raise RuntimeError('Service readiness failed')
 for url in ['https://www.teacher.bnbusports.cn/','https://www.student.bnbusports.cn/api/v1/health/ready']:
  with urllib.request.urlopen(url,timeout=20) as r:assert r.status==200
 switch(release)
 with urllib.request.urlopen('https://www.student.bnbusports.cn/student/js/screens/checkin.js?closure=f87dba74',timeout=20) as r:assert hashlib.sha256(r.read()).hexdigest()==gate['studentSha256']
 print(json.dumps({'check':'COURSE_CLOSURE_DEPLOYMENT','result':'PASS','release':str(release),'images':gate['images']}))
except Exception:
 if (base/'current').resolve()!=previous:switch(previous)
 run(['docker','compose','--project-directory',str(previous),'up','-d','--no-build','--pull','never','backend','portal'])
 print(json.dumps({'check':'COURSE_CLOSURE_DEPLOYMENT','result':'FAILED_ROLLED_BACK'}));raise
