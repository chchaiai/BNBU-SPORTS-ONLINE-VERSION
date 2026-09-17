"""Publish only the validated OpenAPI advisory enum definitions."""
import hashlib,json,os,re,shutil,subprocess,time,urllib.request
from pathlib import Path
assert os.geteuid()==0
base=Path('/opt/bnbu-sports-production');previous=base/'releases/ai-review-ui-20260917';release=base/'releases/ai-review-contract-20260917';work=Path('/home/ubuntu/bnbu-ai-review-20260917/contract-bundle')
out=lambda a:subprocess.check_output(a,text=True).strip();sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
gate=json.loads((work/'validation.json').read_text());assert (base/'current').resolve()==previous and not release.exists()
assert out(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-backend-1'])==gate['baseImage']
assert sha(work/'openapi.document.generated.json')==gate['after']
assert out(['docker','exec','bnbu-sports-production-backend-1','sha256sum','/app/dist/generated/openapi.document.generated.json']).split()[0]==gate['before']
portal=out(['docker','inspect','--format','{{.Id}} {{.Image}} {{.State.StartedAt}}','bnbu-sports-production-portal-1'])
subprocess.run(['docker','tag',gate['baseImage'],'bnbu-backend-ai-review-contract-base:20260917'],check=True)
with (work/'build.log').open('w') as log:subprocess.run(['docker','build','--pull=false','-t','bnbu-backend-production:ai-review-contract-20260917',str(work)],check=True,stdout=log,stderr=subprocess.STDOUT)
image=out(['docker','image','inspect','--format','{{.Id}}','bnbu-backend-production:ai-review-contract-20260917'])
shutil.copytree(previous,release);env,n=re.subn(r'(?m)^BACKEND_IMAGE=.*$','BACKEND_IMAGE='+image,(release/'.env').read_text());assert n==1;(release/'.env').write_text(env)
def start(target):
 subprocess.run(['docker','compose','--project-directory',str(target),'up','-d','--no-deps','--no-build','--pull','never','backend'],check=True)
 for _ in range(90):
  if out(['docker','inspect','--format','{{.State.Health.Status}}','bnbu-sports-production-backend-1'])=='healthy':return
  time.sleep(1)
 raise RuntimeError('Backend readiness timeout')
def switch(target):
 link=base/'current-ai-contract-tmp';assert not link.exists();link.symlink_to(target);os.replace(link,base/'current')
try:
 start(release);switch(release)
 assert out(['docker','inspect','--format','{{.Id}} {{.Image}} {{.State.StartedAt}}','bnbu-sports-production-portal-1'])==portal
 assert out(['docker','exec','bnbu-sports-production-backend-1','sha256sum','/app/dist/generated/openapi.document.generated.json']).split()[0]==gate['after']
 with urllib.request.urlopen('https://www.teacher.bnbusports.cn/api/v1/health/ready',timeout=25) as response:assert response.status==200
 result={'result':'PASS','release':str(release),'previous':str(previous),'backendImage':image,'portalUnchanged':True,'runtimeOpenApiHash':gate['after']}
 (work/'deployment.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
except Exception:switch(previous);start(previous);raise
