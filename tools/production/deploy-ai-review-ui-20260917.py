"""Apply the browser-verified dark theme correction to the pinned Portal image."""
import hashlib,json,os,re,shutil,subprocess,time,urllib.request
from pathlib import Path
assert os.geteuid()==0
base=Path('/opt/bnbu-sports-production');previous=base/'releases/ai-review-20260917';release=base/'releases/ai-review-ui-20260917';work=Path('/home/ubuntu/bnbu-ai-review-20260917/ui-bundle')
gate=json.loads((work/'validation.json').read_text());out=lambda a:subprocess.check_output(a,text=True).strip()
assert (base/'current').resolve()==previous and not release.exists()
assert out(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-portal-1'])==gate['baseImage']
backend=out(['docker','inspect','--format','{{.Id}} {{.Image}} {{.State.StartedAt}}','bnbu-sports-production-backend-1'])
for name,digest in gate['files'].items():assert hashlib.sha256((work/name).read_bytes()).hexdigest()==digest
subprocess.run(['docker','tag',gate['baseImage'],'bnbu-portal-ai-review-ui-base:20260917'],check=True)
with (work/'build.log').open('w') as log:subprocess.run(['docker','build','--pull=false','-t','bnbu-portal-production:ai-review-ui-20260917',str(work)],check=True,stdout=log,stderr=subprocess.STDOUT)
image=out(['docker','image','inspect','--format','{{.Id}}','bnbu-portal-production:ai-review-ui-20260917'])
shutil.copytree(previous,release);env,n=re.subn(r'(?m)^PORTAL_IMAGE=.*$','PORTAL_IMAGE='+image,(release/'.env').read_text());assert n==1;(release/'.env').write_text(env)
def start(target):
 subprocess.run(['docker','compose','--project-directory',str(target),'up','-d','--no-deps','--no-build','--pull','never','portal'],check=True)
 for _ in range(60):
  if out(['docker','inspect','--format','{{.State.Health.Status}}','bnbu-sports-production-portal-1'])=='healthy':return
  time.sleep(1)
 raise RuntimeError('Portal readiness timeout')
def switch(target):
 link=base/'current-ai-ui-tmp';assert not link.exists();link.symlink_to(target);os.replace(link,base/'current')
try:
 start(release);switch(release)
 assert out(['docker','inspect','--format','{{.Id}} {{.Image}} {{.State.StartedAt}}','bnbu-sports-production-backend-1'])==backend
 for url in ['https://www.teacher.bnbusports.cn/','https://www.teacher.bnbusports.cn/api/v1/health/ready']:
  with urllib.request.urlopen(url,timeout=25) as response:assert response.status==200
 for p in (work/'dist/client/assets').glob('*.css'):
  if b'ai-review-panel' not in p.read_bytes():continue
  with urllib.request.urlopen('https://www.teacher.bnbusports.cn/assets/'+p.name,timeout=25) as response:assert hashlib.sha256(response.read()).hexdigest()==hashlib.sha256(p.read_bytes()).hexdigest()
 result={'result':'PASS','release':str(release),'previous':str(previous),'portalImage':image,'backendUnchanged':True,'publicCssHash':'PASS'}
 (work/'deployment.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
except Exception:switch(previous);start(previous);raise
