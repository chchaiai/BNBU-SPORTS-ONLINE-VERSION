import hashlib,json,os,shutil,urllib.request
from pathlib import Path
assert os.geteuid()==0
base=Path('/opt/bnbu-sports-production')
previous=base/'releases/notification-history-20260913'
release=base/'releases/checkin-locale-20260913'
relative='web/student/js/screens/checkin.js'
source=Path('/home/ubuntu/checkin.js')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert (base/'current').resolve()==previous and not release.exists()
assert sha(previous/relative)=='42b72bd9fc76647e724f48bac54f739a6b1f8e2d2f38c3edb7b92a0a6b08657a'
assert sha(source)=='c89c82e16e011ec5567da41e89bd0a730183f89208ac83e352c3b2ad319cc795'
shutil.copytree(previous,release);shutil.copyfile(source,release/relative)
def switch(target):
 link=base/'checkin-locale-current-tmp';assert not link.exists() and not link.is_symlink()
 link.symlink_to(target);os.replace(link,base/'current')
try:
 switch(release)
 with urllib.request.urlopen('https://www.student.bnbusports.cn/student/js/screens/checkin.js?release=checkin-locale-20260913',timeout=20) as response:
  assert response.status==200 and hashlib.sha256(response.read()).hexdigest()==sha(source)
 print(json.dumps({'result':'PASS','release':release.name,'sha256':sha(source),'scope':'Static check-in language display; no container or database mutation'}))
except Exception:
 switch(previous);raise
