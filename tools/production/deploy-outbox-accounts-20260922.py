"""Pinned application-only release; read-only verification and automatic rollback."""
from pathlib import Path
import hashlib,json,os,re,shutil,subprocess,sys,time,urllib.request
assert os.geteuid()==0 and sys.argv[1:] in [['--prepare'],['--apply'],['--rollback']]
base=Path('/opt/bnbu-sports-production');work=Path('/home/ubuntu/bnbu-outbox-accounts-20260922/bundle')
gate=json.loads((work/'validation.json').read_text());previous=base/'releases'/gate['previous'];release=base/'releases/outbox-accounts-20260922'
out=lambda a:subprocess.check_output(a,text=True).strip()
run=lambda a:subprocess.run(a,check=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def compose(target,*args):return ['docker','compose','--project-directory',str(target),*args]
def baseline():
 assert (base/'current').resolve()==previous
 for service in ['backend','portal']:assert out(['docker','inspect','--format','{{.Image}}',f'bnbu-sports-production-{service}-1'])==gate['baseImages'][service]
 assert out(['docker','exec','bnbu-sports-production-backend-1','sha256sum','/app/dist/'+gate['backendFile']]).split()[0]==gate['before']
def healthy(name,seconds=90):
 for _ in range(seconds):
  if out(['docker','inspect','--format','{{.State.Health.Status}}',name])=='healthy':return
  time.sleep(1)
 raise RuntimeError('Health timeout: '+name)
def start(target):
 run(compose(target,'up','-d','--no-deps','--no-build','--pull','never','backend','portal'))
 for s in ['backend','portal']:healthy('bnbu-sports-production-'+s+'-1')
def switch(target):
 link=base/'current-outbox-accounts-tmp';assert not link.exists() and not link.is_symlink();link.symlink_to(target);os.replace(link,base/'current')
def http(url):
 with urllib.request.urlopen(url,timeout=30) as r:assert r.status==200;return r.read()
def public_health():
 for url in ['https://www.teacher.bnbusports.cn/','https://www.student.bnbusports.cn/student/','https://www.teacher.bnbusports.cn/api/v1/health/ready']:http(url)
def verify(target):
 result=json.loads(out(compose(target,'run','--rm','--no-deps','--entrypoint','node','-v',str(work/'verify.mjs')+':/app/verify-outbox-accounts.mjs:ro','backend','/app/verify-outbox-accounts.mjs')))
 assert result['result']=='PASS';return result
if sys.argv[1]=='--rollback':
 assert (base/'current').resolve()==release;start(previous);switch(previous);public_health();print('ROLLED_BACK');raise SystemExit
assert gate['checks']=={'backendTypes':'PASS','portalTypes':'PASS','portalBuild':'PASS','cacheTests':3,'postgresProjectionTests':1}
for name,digest in gate['files'].items():assert sha(work/name)==digest,name
baseline()
if sys.argv[1]=='--prepare':
 assert not release.exists();images={}
 for service in ['backend','portal']:
  run(['docker','tag',gate['baseImages'][service],f'bnbu-{service}-outbox-accounts-base:20260922'])
  tag=f'bnbu-{service}-production:outbox-accounts-20260922'
  with (work/(service+'-build.log')).open('w') as log:subprocess.run(['docker','build','--pull=false','-t',tag,str(work/service)],check=True,stdout=log,stderr=subprocess.STDOUT)
  images[service]=out(['docker','image','inspect','--format','{{.Id}}',tag])
 name='bnbu-outbox-accounts-portal-candidate'
 run(['docker','run','--rm','-d','--name',name,'--network','none','--read-only','--tmpfs','/tmp','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','512m','--health-interval','2s',images['portal']])
 try:healthy(name,50)
 finally:run(['docker','stop',name])
 baseline();shutil.copytree(previous,release);content=(release/'.env').read_text()
 for service,image in images.items():content,n=re.subn(r'(?m)^'+service.upper()+'_IMAGE=.*$',service.upper()+'_IMAGE='+image,content);assert n==1
 (release/'.env').write_text(content)
 for name in ['compose.yml','production.env','nginx.conf']:assert sha(previous/name)==sha(release/name)
 for p in (previous/'web').rglob('*'):
  if p.is_file():assert sha(p)==sha(release/p.relative_to(previous))
 result=verify(release)
 (work/'prepared.json').write_text(json.dumps({'images':images,'verification':result}));print(json.dumps({'result':'PREPARED','images':images,'verification':result}));raise SystemExit
prepared=json.loads((work/'prepared.json').read_text())
backup=json.loads(out(['python3',str(work/'backup.py')]));assert backup['result']=='PASS';(work/'backup.json').write_text(json.dumps(backup))
baseline()
try:
 start(release);switch(release);public_health()
 assert out(['docker','exec','bnbu-sports-production-backend-1','sha256sum','/app/dist/'+gate['backendFile']]).split()[0]==gate['after']
 assets={n:d for n,d in gate['files'].items() if n.startswith('portal/dist/client/assets/')};assert assets
 for name,digest in assets.items():assert hashlib.sha256(http('https://www.teacher.bnbusports.cn/'+name.removeprefix('portal/dist/client/'))).hexdigest()==digest,name
 verification=verify(release)
 result={'result':'PASS','release':str(release),'previous':str(previous),'images':prepared['images'],'backup':backup,'verification':verification,'publicPortalAssets':len(assets),'health':'PASS','databaseMigrations':0,'studentAssetsUnchanged':True,'rollbackAvailable':True}
 (work/'deployment.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
except Exception:
 start(previous)
 if (base/'current').resolve()!=previous:switch(previous)
 public_health();raise
