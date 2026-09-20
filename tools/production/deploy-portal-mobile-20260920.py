"""Publish the verified teacher roster workflow, with a pinned baseline and portal rollback."""
from pathlib import Path
import hashlib,json,os,re,shutil,subprocess,sys,time,urllib.request
BASE=Path('/opt/bnbu-sports-production')
WORK=Path('/home/ubuntu/bnbu-portal-mobile-20260920')
RELEASE=BASE/'releases/portal-mobile-20260920'
assert os.geteuid()==0 and sys.argv[1:] in [['--prepare'],['--apply'],['--rollback']]
gate=json.loads((WORK/'validation.json').read_text())
previous=BASE/'releases'/gate['previous']
assert previous.is_relative_to(BASE/'releases') and previous!=RELEASE
out=lambda args:subprocess.check_output(args,text=True).strip()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def run(args):subprocess.run(args,check=True)
def state(service):return out(['docker','inspect','--format','{{.Id}} {{.Image}} {{.State.StartedAt}} {{.State.Health.Status}}',f'bnbu-sports-production-{service}-1'])
def http(url):
 with urllib.request.urlopen(url,timeout=25) as r:assert r.status==200;return r.read()
def switch(target):
 assert target.is_relative_to(BASE/'releases') and target.is_dir()
 link=BASE/'current-portal-mobile-tmp';assert not link.exists() and not link.is_symlink()
 link.symlink_to(target);os.replace(link,BASE/'current')
def start(target):
 run(['docker','compose','--project-directory',str(target),'up','-d','--no-deps','--no-build','--pull','never','portal'])
 for _ in range(90):
  if state('portal').endswith('healthy'):return
  time.sleep(1)
 raise RuntimeError('Portal health timeout')
if sys.argv[1]=='--rollback':
 assert (BASE/'current').resolve() in [previous,RELEASE]
 start(previous);switch(previous);http('https://www.teacher.bnbusports.cn/');print(json.dumps({'result':'ROLLED_BACK','release':str(previous)}));raise SystemExit
assert gate['checks']=={'previewPages': 68, 'forms': 4, 'httpPassed': 5, 'typecheck': 'PASS', 'build': 'PASS', 'baselineFindings': 2}
assert (BASE/'current').resolve()==previous
assert out(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-portal-1'])==gate['basePortalImage']
assert state('backend').endswith('healthy') and state('portal').endswith('healthy')
for name,digest in gate['files'].items():
 p=(WORK/name).resolve(strict=True);assert p.is_relative_to(WORK) and sha(p)==digest,name
if sys.argv[1]=='--prepare':
 assert not RELEASE.exists()
 run(['docker','tag',gate['basePortalImage'],'bnbu-portal-portal-mobile-base:20260920'])
 tag='bnbu-portal-production:portal-mobile-20260920'
 run(['docker','build','--pull=false','-t',tag,str(WORK)])
 image=out(['docker','image','inspect','--format','{{.Id}}',tag])
 candidate='bnbu-portal-mobile-candidate'
 run(['docker','run','--rm','-d','--name',candidate,'--network','none','--read-only','--tmpfs','/tmp','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','512m','--health-interval','2s',image])
 try:
  for _ in range(45):
   if out(['docker','inspect','--format','{{.State.Health.Status}}',candidate])=='healthy':break
   time.sleep(1)
  else:raise RuntimeError('Candidate health timeout')
  assert out(['docker','exec',candidate,'sha256sum','/app/dist/server/index.js']).split()[0]==gate['files']['dist/server/index.js']
 finally:run(['docker','stop',candidate])
 prepared={'image':image,'backend':state('backend'),'baseline':{n:sha(previous/n) for n in ['.env','compose.yml','production.env','nginx.conf']}}
 (WORK/'prepared.json').write_text(json.dumps(prepared,indent=2));print(json.dumps({'result':'PREPARED','image':image}));raise SystemExit
prepared=json.loads((WORK/'prepared.json').read_text());assert state('backend')==prepared['backend']
for name,digest in prepared['baseline'].items():assert sha(previous/name)==digest,name
assert not RELEASE.exists();shutil.copytree(previous,RELEASE)
content,n=re.subn(r'(?m)^PORTAL_IMAGE=.*$','PORTAL_IMAGE='+prepared['image'],(RELEASE/'.env').read_text());assert n==1
(RELEASE/'.env').write_text(content)
assets={n:d for n,d in gate['files'].items() if n.startswith('dist/client/assets/')}
assert assets
try:
 start(RELEASE);switch(RELEASE)
 assert out(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-portal-1'])==prepared['image']
 for n,d in assets.items():assert hashlib.sha256(http('https://www.teacher.bnbusports.cn/'+n.removeprefix('dist/client/'))).hexdigest()==d,n
 for url in ['https://www.teacher.bnbusports.cn/','https://www.teacher.bnbusports.cn/api/v1/health/ready','https://www.student.bnbusports.cn/student/']:http(url)
 assert state('backend')==prepared['backend']
 for name in ['compose.yml','production.env','nginx.conf']:assert sha(RELEASE/name)==prepared['baseline'][name]
 result={'result':'PASS','release':str(RELEASE),'previous':str(previous),'portalImage':prepared['image'],'backendUnchanged':True,'migrationExecuted':False,'publicAssets':len(assets),'health':'PASS'}
 (WORK/'deployment.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
except Exception:
 start(previous);switch(previous);raise
