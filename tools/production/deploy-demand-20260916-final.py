"""Publish the verified student completion-status rendering fix with atomic static rollback."""
import hashlib,json,os,shutil,subprocess,urllib.request
from pathlib import Path
assert os.geteuid()==0
base=Path('/opt/bnbu-sports-production');work=Path('/home/ubuntu/bnbu-demand-20260916')
previous=base/'releases/demand-20260916';release=base/'releases/demand-20260916-final'
gate=json.loads((work/'final-static.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
name='web/student/js/screens/checkin.js'
assert (base/'current').resolve()==previous and not release.exists()
assert sha(previous/name)==gate['before'] and sha(work/'final-checkin.js')==gate['after']
snapshot=lambda:subprocess.check_output(['docker','inspect','--format','{{.Id}} {{.Image}} {{.State.StartedAt}}','bnbu-sports-production-backend-1','bnbu-sports-production-portal-1'],text=True)
containers=snapshot();shutil.copytree(previous,release);shutil.copyfile(work/'final-checkin.js',release/name)
def switch(target):
 link=base/'current-demand-final-tmp';assert not link.exists() and not link.is_symlink();link.symlink_to(target);os.replace(link,base/'current')
try:
 switch(release)
 with urllib.request.urlopen('https://www.student.bnbusports.cn/student/js/screens/checkin.js?verify=demand-20260916-final',timeout=25) as response:assert response.status==200 and hashlib.sha256(response.read()).hexdigest()==gate['after']
 assert snapshot()==containers
 result={'result':'PASS','release':str(release),'previous':str(previous),'file':name,'sha256':gate['after'],'containersUnchanged':True}
 (work/'final-deployment.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
except Exception:switch(previous);raise
