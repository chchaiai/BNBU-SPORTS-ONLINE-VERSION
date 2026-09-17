"""Atomic student-only fix, pinned to the inspected live release and hashes."""
import hashlib,json,os,shutil,subprocess,urllib.request
from pathlib import Path
assert os.geteuid()==0
base=Path('/opt/bnbu-sports-production');work=Path('/home/ubuntu/bnbu-student-network-20260916')
previous=base/'releases/photo-capture-20260916';release=base/'releases/student-network-20260916'
gate=json.loads((work/'validation.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert (base/'current').resolve()==previous and not release.exists()
for name,item in gate.items():
 assert name in ['js/api.js','js/app.js','js/screens/startup.js']
 assert sha(previous/'web/student'/name)==item['before'] and sha(work/name)==item['after']
snapshot=lambda:subprocess.check_output(['docker','inspect','--format','{{.Id}} {{.Image}} {{.State.StartedAt}}','bnbu-sports-production-backend-1','bnbu-sports-production-portal-1'],text=True)
containers=snapshot();shutil.copytree(previous,release)
for name in gate:shutil.copyfile(work/name,release/'web/student'/name)
def switch(target):
 link=base/'current-network-fix-tmp';assert not link.exists() and not link.is_symlink();link.symlink_to(target);os.replace(link,base/'current')
try:
 switch(release)
 for name,item in gate.items():
  with urllib.request.urlopen('https://www.student.bnbusports.cn/student/'+name+'?verify=student-network-20260916',timeout=25) as response:assert response.status==200 and hashlib.sha256(response.read()).hexdigest()==item['after']
 assert snapshot()==containers
 with urllib.request.urlopen('https://www.teacher.bnbusports.cn/api/v1/health/ready',timeout=25) as response:assert response.status==200
 result={'result':'PASS','release':str(release),'previous':str(previous),'files':gate,'containersUnchanged':True,'health':'PASS'}
 (work/'deployment.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
except Exception:switch(previous);raise
