"""Deploy UTC-only backend image with automatic application rollback; no database migration."""
import hashlib,json,os,re,shutil,subprocess,sys,time,urllib.request
from pathlib import Path
assert os.geteuid()==0 and sys.argv[1:]==['--apply']
base=Path('/opt/bnbu-sports-production');previous=base/'releases/ocr-full-20260913';release=base/'releases/utc-20260913';work=Path('/home/ubuntu/bnbu-utc-20260913')
assert (base/'current').resolve()==previous and not release.exists()
def run(args):subprocess.run(args,check=True)
def output(args):return subprocess.check_output(args,text=True).strip()
gate=json.loads((work/'validation.json').read_text())
assert output(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-backend-1'])==gate['baseImage']
for name,digest in gate['files'].items():assert hashlib.sha256((work/name).read_bytes()).hexdigest()==digest
image='bnbu-backend-production:utc-20260913';image_id=output(['docker','image','inspect','--format','{{.Id}}',image])
assert image_id=='sha256:51838920fd4be9fb654511225e1185232d61e5b2dc1d683fd211543d1e952fa0'
shutil.copytree(previous,release)
env=release/'.env';content,count=re.subn(r'(?m)^BACKEND_IMAGE=.*$', 'BACKEND_IMAGE='+image,env.read_text());assert count==1;env.write_text(content)
def switch(target):
 link=base/'current-utc-tmp';assert not link.exists() and not link.is_symlink();link.symlink_to(target);os.replace(link,base/'current')
def healthy():
 for attempt in range(90):
  state=output(['docker','inspect','--format','{{.State.Health.Status}}','bnbu-sports-production-backend-1'])
  if state=='healthy':return
  time.sleep(1)
 raise RuntimeError('Backend readiness timeout')
result={'check':'UTC_BACKEND_DEPLOYMENT','previous':str(previous),'release':str(release),'image':image_id,'databaseMigration':False}
try:
 run(['docker','compose','--project-directory',str(release),'up','-d','--no-deps','--no-build','--pull','never','backend'])
 healthy();switch(release)
 for url in ['https://www.student.bnbusports.cn/api/v1/health/ready','https://www.student.bnbusports.cn/student/','https://www.teacher.bnbusports.cn/']:
  with urllib.request.urlopen(url,timeout=20) as response:assert response.status==200 and response.read()
 assert output(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-backend-1'])==image_id
 result['status']='PASS'
except Exception as error:
 result['status']='ROLLED_BACK';result['errorType']=type(error).__name__
 switch(previous);run(['docker','compose','--project-directory',str(previous),'up','-d','--no-deps','--no-build','--pull','never','backend']);healthy()
 raise
finally:
 result['observedAtEpoch']=time.time();(work/'deployment-result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
