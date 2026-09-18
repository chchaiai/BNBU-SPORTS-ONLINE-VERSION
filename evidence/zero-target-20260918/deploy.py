"""Pinned student capture release; preserve the currently running backend and portal."""
import hashlib,json,os,shutil,subprocess,urllib.request
from pathlib import Path
assert os.geteuid()==0
base=Path('/opt/bnbu-sports-production');work=Path('/home/ubuntu/bnbu-zero-target-20260918')
previous=base/'releases/feedback-final-20260918';release=base/'releases/zero-target-20260918'
gate=json.loads((work/'validation.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert (base/'current').resolve()==previous and not release.exists()
assert set(gate)=={'js/screens/checkin.js'}
for name,item in gate.items():
 assert sha(previous/'web/student'/name)==item['before'] and sha(work/name)==item['after'],name
snapshot=lambda:subprocess.check_output(['docker','inspect','--format','{{.Id}} {{.Image}} {{.State.StartedAt}}','bnbu-sports-production-backend-1','bnbu-sports-production-portal-1'],text=True)
containers=snapshot();shutil.copytree(previous,release)
for name in gate:shutil.copyfile(work/name,release/'web/student'/name)
def switch(target):
 link=base/'current-zero-target-tmp';assert not link.exists() and not link.is_symlink();link.symlink_to(target);os.replace(link,base/'current')
try:
 assert (base/'current').resolve()==previous and snapshot()==containers
 switch(release)
 cache={}
 for name,item in gate.items():
  with urllib.request.urlopen('https://www.student.bnbusports.cn/student/'+name+'?verify=zero-target-20260918',timeout=25) as response:
   assert response.status==200 and hashlib.sha256(response.read()).hexdigest()==item['after']
   cache[name]=response.headers.get('Cache-Control')
 assert snapshot()==containers
 for url in ['https://www.student.bnbusports.cn/student/','https://www.teacher.bnbusports.cn/api/v1/health/ready']:
  with urllib.request.urlopen(url,timeout=25) as response:assert response.status==200
 result={'result':'PASS','release':str(release),'previous':str(previous),'files':gate,'containersUnchanged':True,'health':'PASS','cacheControl':cache}
 (work/'deployment.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
except Exception:
 switch(previous);raise
