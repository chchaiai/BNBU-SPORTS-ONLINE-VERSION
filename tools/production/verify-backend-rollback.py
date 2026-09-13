"""Bounded backend application rollback and restore; static release stays current."""
import json,os,subprocess,time,urllib.request
from pathlib import Path
assert os.geteuid()==0
base=Path('/opt/bnbu-sports-production')
current=base/'releases/public-note-locale-20260913'
previous=base/'releases/notification-locale-20260913'
assert (base/'current').resolve()==current
for name in ['production.env','compose.yml']:
 assert (current/name).read_bytes()==(previous/name).read_bytes()
def output(args):return subprocess.check_output(args,text=True).strip()
def inspect(name,fmt):return output(['docker','inspect','--format',fmt,name])
backend='bnbu-sports-production-backend-1';portal='bnbu-sports-production-portal-1'
initial='sha256:c7253e550053e45b5f40bb0d447e4c971db54790554b9d658b7d07d627118ccb'
old='sha256:59eedded13c53c0c7a93ea71083e9f9eabe7532cc12041bbae2a0e6957c0fc9b'
assert inspect(backend,'{{.Image}}')==initial
assert output(['docker','image','inspect','--format','{{.Id}}','bnbu-backend-production:notification-locale-20260913'])==old
portal_before=inspect(portal,'{{.Id}} {{.Image}} {{.State.StartedAt}}')
steps=[]
def activate(target,expected):
 subprocess.run(['docker','compose','--project-directory',str(target),'up','-d','--no-build','--pull','never','--no-deps','backend'],check=True)
 for _ in range(45):
  try:
   with urllib.request.urlopen('https://www.student.bnbusports.cn/api/v1/health/ready',timeout=3) as response:
    if response.status==200:break
  except Exception:pass
  time.sleep(1)
 else:raise RuntimeError('Readiness timeout')
 assert inspect(backend,'{{.Image}}')==expected
 assert inspect(portal,'{{.Id}} {{.Image}} {{.State.StartedAt}}')==portal_before
 assert (base/'current').resolve()==current
 steps.append({'image':expected,'readiness':200,'portalUnchanged':True,'staticRelease':current.name})
try:activate(previous,old)
finally:activate(current,initial)
print(json.dumps({'result':'PASS','check':'BACKEND_APPLICATION_ROLLBACK_AND_RESTORE','observedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'steps':steps,'restored':True,'scope':'Backend image rollback with existing 76-migration database; no database restore or static downgrade'}))
