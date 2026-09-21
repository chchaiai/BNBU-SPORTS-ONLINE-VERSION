"""Portal-only course layout release with pinned baseline and automatic rollback."""
from pathlib import Path
import subprocess,shutil,re,os,time,json,hashlib,urllib.request
base=Path('/opt/bnbu-sports-production'); previous=base/'releases/admin-insights-20260921';release=base/'releases/course-layout-20260921';work=Path('/home/ubuntu/bnbu-course-layout-20260921')
out=lambda a:subprocess.check_output(a,text=True).strip()
run=lambda a:subprocess.run(a,check=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
expected='sha256:571a150cf362d61a9d3878e288a6313df4b6a41b30a7254008ab1573e86e8fd1'
assert os.geteuid()==0 and (base/'current').resolve()==previous
assert out(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-portal-1'])==expected
assert not release.exists()
backend=out(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-backend-1'])
gate=json.loads((work/'hashes.json').read_text())
for name,digest in gate.items():assert sha(work/name)==digest,name
run(['docker','tag',expected,'bnbu-portal-course-layout-base:20260921'])
run(['docker','build','--pull=false','-t','bnbu-portal-production:course-layout-20260921',str(work)])
image=out(['docker','image','inspect','--format','{{.Id}}','bnbu-portal-production:course-layout-20260921'])
def healthy(name):
 for _ in range(60):
  if out(['docker','inspect','--format','{{.State.Health.Status}}',name])=='healthy':return
  time.sleep(1)
 raise RuntimeError('Portal health timeout')
name='bnbu-course-layout-candidate';run(['docker','run','--rm','-d','--name',name,'--network','none','--read-only','--tmpfs','/tmp','--cap-drop','ALL','--security-opt','no-new-privileges','--health-interval','2s',image])
try:healthy(name)
finally:run(['docker','stop',name])
shutil.copytree(previous,release)
content,n=re.subn(r'(?m)^PORTAL_IMAGE=.*$','PORTAL_IMAGE='+image,(release/'.env').read_text());assert n==1;(release/'.env').write_text(content)
def start(path):run(['docker','compose','--project-directory',str(path),'up','-d','--no-deps','--no-build','--pull','never','portal']);healthy('bnbu-sports-production-portal-1')
def switch(path):
 link=base/'current-course-layout-tmp';assert not link.exists();link.symlink_to(path);os.replace(link,base/'current')
def get(url):
 with urllib.request.urlopen(url,timeout=30) as r:assert r.status==200;return r.read()
try:
 assert (base/'current').resolve()==previous
 start(release);switch(release)
 get('https://www.teacher.bnbusports.cn/');get('https://www.teacher.bnbusports.cn/api/v1/health/ready')
 assets={n:d for n,d in gate.items() if n.startswith('dist/client/assets/')}
 for n,d in assets.items():assert hashlib.sha256(get('https://www.teacher.bnbusports.cn/'+n.removeprefix('dist/client/'))).hexdigest()==d,n
 assert out(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-backend-1'])==backend
 result={'result':'PASS','release':str(release),'previous':str(previous),'portalImage':image,'publicAssetsVerified':len(assets),'backendUnchanged':True,'databaseChanges':False}
 (work/'deployment.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
except Exception:
 start(previous);switch(previous);raise
