import hashlib,json,os,shutil,urllib.request
from pathlib import Path
assert os.geteuid()==0
base=Path('/opt/bnbu-sports-production')
previous=base/'releases/invite-ui-final-20260913'
release=base/'releases/student-notification-copy-20260913'
work=Path('/home/ubuntu')
gate=json.loads((work/'notification-copy-validation.json').read_text())
relative='web/student/js/screens/notifications.js'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert (base/'current').resolve()==previous and not release.exists()
assert sha(previous/relative)==gate['before']
assert sha(work/'notifications.js')==gate['after']
shutil.copytree(previous,release)
shutil.copyfile(work/'notifications.js',release/relative)
for name in ['.env','production.env','compose.yml','nginx.conf']:
 assert (previous/name).read_bytes()==(release/name).read_bytes()
def switch(target):
 link=base/'notification-copy-current-tmp'
 assert not link.exists() and not link.is_symlink()
 link.symlink_to(target);os.replace(link,base/'current')
try:
 switch(release)
 with urllib.request.urlopen('https://www.student.bnbusports.cn/student/js/screens/notifications.js?check=notification-copy-20260913',timeout=20) as r:
  assert r.status==200 and hashlib.sha256(r.read()).hexdigest()==gate['after']
 print(json.dumps({'check':'STUDENT_NOTIFICATION_COPY_DEPLOYMENT','result':'PASS','release':release.name,'previous':previous.name,'sha256':gate['after'],'scope':'One static notification explanatory text; no container or database change'}))
except Exception:
 switch(previous);raise
