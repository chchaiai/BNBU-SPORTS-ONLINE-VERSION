"""Deploy the two-module historical notification read projection."""
import hashlib,json,os,re,shutil,subprocess,time,urllib.request
from pathlib import Path
assert os.geteuid()==0
base=Path('/opt/bnbu-sports-production')
previous=base/'releases/notification-locale-20260913'
release=base/'releases/notification-history-20260913'
work=Path('/home/ubuntu/notification-history-release')
assert (base/'current').resolve()==previous and not release.exists()
def output(args):return subprocess.check_output(args,text=True).strip()
def run(args):subprocess.run(args,check=True)
old='sha256:59eedded13c53c0c7a93ea71083e9f9eabe7532cc12041bbae2a0e6957c0fc9b'
assert output(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-backend-1'])==old
assert output(['docker','image','inspect','--format','{{.Id}}','bnbu-backend-production:notification-locale-20260913'])==old
gate=json.loads((work/'validation.json').read_text())
for name,sha in gate['files'].items():
 path=(work/name).resolve(strict=True)
 assert path.is_relative_to(work) and hashlib.sha256(path.read_bytes()).hexdigest()==sha
portal=output(['docker','inspect','--format','{{.Id}} {{.Image}}','bnbu-sports-production-portal-1'])
tag='bnbu-backend-production:notification-history-20260913'
run(['docker','build','--pull=false','-t',tag,str(work)])
image=output(['docker','image','inspect','--format','{{.Id}}',tag])
run(['docker','run','--rm','--network','none','--read-only','--cap-drop','ALL','--entrypoint','node',image,'--input-type=module','-e',"await import('./dist/modules/client-capabilities/client-messaging.service.js')"])
shutil.copytree(previous,release)
env,count=re.subn(r'(?m)^BACKEND_IMAGE=.*$','BACKEND_IMAGE='+tag,(release/'.env').read_text());assert count==1
(release/'.env').write_text(env)
def switch(target):
 link=base/'current-notification-history-tmp';assert not link.exists() and not link.is_symlink()
 link.symlink_to(target);os.replace(link,base/'current')
def start(target):
 run(['docker','compose','--project-directory',str(target),'up','-d','--no-deps','--no-build','--pull','never','backend'])
 for _ in range(60):
  try:
   with urllib.request.urlopen('https://www.student.bnbusports.cn/api/v1/health/ready',timeout=3) as response:
    if response.status==200:return
  except Exception:pass
  time.sleep(1)
 raise RuntimeError('Readiness timeout')
try:
 start(release);switch(release)
 assert output(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-backend-1'])==image
 assert output(['docker','inspect','--format','{{.Id}} {{.Image}}','bnbu-sports-production-portal-1'])==portal
except Exception:
 if (base/'current').resolve()!=previous:switch(previous)
 start(previous)
 print(json.dumps({'result':'FAILED_APPLICATION_ROLLED_BACK'}));raise
result={'result':'PASS','release':str(release),'image':image,'migrationExecuted':False,'databaseMutated':False,'browserRegression':'PENDING'}
(work/'deployment-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
