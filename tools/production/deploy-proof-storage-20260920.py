"""Pinned proof persistence and image pixel-cap release; retained atomic rollback."""
import hashlib,json,os,re,shutil,subprocess,sys,time,urllib.request
from pathlib import Path
assert os.geteuid()==0 and sys.argv[1:] in [['--prepare'],['--apply'],['--rollback']]
base=Path('/opt/bnbu-sports-production');work=Path('/home/ubuntu/bnbu-proof-storage-20260920/bundle')
gate=json.loads((work/'validation.json').read_text());previous=base/'releases/browser-open-all-20260920';release=base/'releases/proof-storage-pixels-20260920'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
out=lambda a:subprocess.check_output(a,text=True).strip()
run=lambda a:subprocess.run(a,check=True)
compose=lambda target,*args:['docker','compose','--project-directory',str(target),*args]
def baseline():
 assert (base/'current').resolve()==previous
 assert out(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-backend-1'])==gate['baseBackend']
 for row in gate['delta']:assert out(['docker','exec','bnbu-sports-production-backend-1','sha256sum','/app/dist/'+row['path']]).split()[0]==row['before']
 for row in gate['web']:assert sha(previous/'web/student'/row['path'])==row['before']
def switch(target):
 assert target in [previous,release] and target.is_dir()
 link=base/'current-proof-storage-tmp';assert not link.exists() and not link.is_symlink();link.symlink_to(target);os.replace(link,base/'current')
def start(target):
 run(compose(target,'up','-d','--no-deps','--no-build','--pull','never','backend'))
 for _ in range(90):
  if out(['docker','inspect','--format','{{.State.Health.Status}}','bnbu-sports-production-backend-1'])=='healthy':return
  time.sleep(1)
 raise RuntimeError('Backend readiness timeout')
def health():
 for url in ['https://www.student.bnbusports.cn/student/','https://www.teacher.bnbusports.cn/','https://www.student.bnbusports.cn/api/v1/health/ready']:
  with urllib.request.urlopen(url,timeout=20) as r:assert r.status==200
def verify(target):
 command=compose(target,'run','--rm','--no-deps','-T','--entrypoint','node','-v',str(work/'verify.mjs')+':/app/verify-proof.mjs:ro','backend','/app/verify-proof.mjs')
 result=json.loads(out(command));assert result['result']=='PASS';return result
if sys.argv[1]=='--rollback':
 assert (base/'current').resolve()==release;start(previous);switch(previous);health();print('ROLLED_BACK');raise SystemExit
assert gate['previous']==previous.name and gate['checks']=={'frontend':25,'backendMedia':25,'browser':3}
assert {r['path'] for r in gate['delta']}=={'common/config/environment.js','modules/media/application/media-validator.js'}
assert {r['path'] for r in gate['web']}=={'js/api.js','js/checkin-drafts.js','js/screens/checkin.js'}
for name,digest in gate['files'].items():assert sha(work/name)==digest,name
baseline()
if sys.argv[1]=='--prepare':
 assert not release.exists()
 run(['docker','tag',gate['baseBackend'],'bnbu-proof-storage-base:20260920'])
 with (work/'build.log').open('w') as log:subprocess.run(['docker','build','--pull=false','-t','bnbu-backend-production:proof-storage-pixels-20260920',str(work/'backend')],check=True,stdout=log,stderr=subprocess.STDOUT)
 image=out(['docker','image','inspect','--format','{{.Id}}','bnbu-backend-production:proof-storage-pixels-20260920'])
 baseline();shutil.copytree(previous,release)
 env=(release/'.env').read_text();env,n=re.subn(r'(?m)^BACKEND_IMAGE=.*$','BACKEND_IMAGE='+image,env);assert n==1;(release/'.env').write_text(env)
 runtime=(release/'production.env').read_text();runtime,n=re.subn(r'(?m)^MEDIA_MAX_IMAGE_PIXELS=40000000$','MEDIA_MAX_IMAGE_PIXELS=0',runtime);assert n==1;(release/'production.env').write_text(runtime)
 for row in gate['web']:shutil.copyfile(work/'web/student'/row['path'],release/'web/student'/row['path'])
 changed={str(p.relative_to(previous)) for p in previous.rglob('*') if p.is_file() and sha(p)!=sha(release/p.relative_to(previous))}
 assert changed=={'.env','production.env'}|{'web/student/'+r['path'] for r in gate['web']}
 verification=verify(release)
 (work/'prepared.json').write_text(json.dumps({'image':image,'verification':verification}));print(json.dumps({'result':'PREPARED','image':image,'verification':verification}));raise SystemExit
prepared=json.loads((work/'prepared.json').read_text());assert prepared['verification']['result']=='PASS'
portal=out(['docker','inspect','--format','{{.Id}}','bnbu-sports-production-portal-1'])
try:
 start(release);switch(release);health()
 assert out(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-backend-1'])==prepared['image']
 for row in gate['delta']:assert out(['docker','exec','bnbu-sports-production-backend-1','sha256sum','/app/dist/'+row['path']]).split()[0]==row['after']
 for row in gate['web']:
  for suffix in ['', '?verify=proof-storage-pixels-20260920']:
   with urllib.request.urlopen('https://www.student.bnbusports.cn/student/'+row['path']+suffix,timeout=20) as r:
    assert r.status==200 and hashlib.sha256(r.read()).hexdigest()==row['after'];assert 'no-store' in r.headers.get('Cache-Control','')
 assert out(['docker','inspect','--format','{{.Id}}','bnbu-sports-production-portal-1'])==portal
 result={'result':'PASS','release':str(release),'previous':str(previous),'image':prepared['image'],'runtimeHashes':2,'publicHashes':3,'pixelCap':0,'health':'PASS','migrationExecuted':False,'businessWrites':0,'rollbackAvailable':True,'verification':prepared['verification']}
 (work/'deployment.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
except Exception:
 start(previous);switch(previous);health();print('FAILED_ROLLED_BACK');raise
