"""Pinned additive migration, private backup, runtime verification and application rollback."""
from pathlib import Path
import hashlib,json,os,re,shutil,subprocess,sys,time,urllib.request
assert os.geteuid()==0
assert sys.argv[1:] in [['--prepare'],['--apply'],['--rollback']]
base=Path('/opt/bnbu-sports-production');work=Path('/home/ubuntu/bnbu-feedback-erasure-20260923/bundle')
gate=json.loads((work/'validation.json').read_text());previous=base/'releases'/gate['release'];release=base/'releases/feedback-erasure-20260923'
out=lambda args:subprocess.check_output(args,text=True).strip()
run=lambda args:subprocess.run(args,check=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def compose(target,*args):return ['docker','compose','--project-directory',str(target),*args]
def baseline():
 assert (base/'current').resolve()==previous
 for service in ['backend','portal']:assert out(['docker','inspect','--format','{{.Image}}',f'bnbu-sports-production-{service}-1'])==gate['baseImages'][service]
 for item in gate['delta']:assert out(['docker','exec','bnbu-sports-production-backend-1','sha256sum','/app/dist/'+item['path']]).split()[0]==item['before'],item['path']
def switch(target):
 link=base/'current-feedback-erasure-tmp';assert not link.exists() and not link.is_symlink();link.symlink_to(target);os.replace(link,base/'current')
def start(target):
 run(compose(target,'up','-d','--no-deps','--no-build','--pull','never','backend'))
 for _ in range(90):
  if out(['docker','inspect','--format','{{.State.Health.Status}}','bnbu-sports-production-backend-1'])=='healthy':return
  time.sleep(1)
 raise RuntimeError('Backend health timeout')
def health():
 for url in ['https://www.student.bnbusports.cn/student/','https://www.teacher.bnbusports.cn/','https://www.student.bnbusports.cn/api/v1/health/ready']:
  with urllib.request.urlopen(url,timeout=30) as r:assert r.status==200
def verify(target,after=False):
 args=compose(target,'run','--rm','--no-deps','--entrypoint','node','-v',str(work/'verify.mjs')+':/app/verify-feedback-erasure.mjs:ro','backend','/app/verify-feedback-erasure.mjs')
 if after:args+=['--after']
 result=json.loads(out(args));assert result['result']=='PASS';return result
if sys.argv[1]=='--rollback':
 assert (base/'current').resolve()==release;start(previous);switch(previous);health();print('ROLLED_BACK_APPLICATION_ADDITIVE_MIGRATION_RETAINED');raise SystemExit
assert gate['checks']=={'unit':9,'isolatedPostgres':8}
for name,digest in gate['files'].items():assert sha(work/name)==digest,name
baseline()
if sys.argv[1]=='--prepare':
 assert not release.exists();images={}
 for service in ['backend','migrator']:
  run(['docker','tag',gate['baseImages'][service],f'bnbu-{service}-feedback-erasure-base:20260923'])
  tag=f'bnbu-{service}-production:feedback-erasure-20260923'
  with (work/(service+'-build.log')).open('w') as log:subprocess.run(['docker','build','--pull=false','-t',tag,str(work/service)],check=True,stdout=log,stderr=subprocess.STDOUT)
  images[service]=out(['docker','image','inspect','--format','{{.Id}}',tag])
 # Test the exact candidate on the isolated database, without production mounts or environment.
 args=['docker','run','--rm','--network','feedback-erasure-test-20260923','--memory','256m','--cpus','0.5','-e','DATABASE_URL=postgresql://postgres@feedback-erasure-db:5432/feedback_erasure_test','-v',str(work/'test.mjs')+':/app/test-feedback-erasure.mjs:ro','--entrypoint','node',images['backend'],'/app/test-feedback-erasure.mjs']
 test=json.loads(out(args).splitlines()[-1]);assert test['result']=='PASS' and test['count']==8
 (work/'isolated-tests.json').write_text(json.dumps(test,indent=2))
 baseline();shutil.copytree(previous,release);content=(release/'.env').read_text()
 for service,image in images.items():content,n=re.subn(r'(?m)^'+service.upper()+'_IMAGE=.*$',service.upper()+'_IMAGE='+image,content);assert n==1
 (release/'.env').write_text(content)
 for name in ['compose.yml','production.env','nginx.conf']:assert sha(previous/name)==sha(release/name)
 for p in (previous/'web').rglob('*'):
  if p.is_file():assert sha(p)==sha(release/p.relative_to(previous))
 before=verify(previous);(work/'before.json').write_text(json.dumps(before,indent=2))
 (work/'prepared.json').write_text(json.dumps({'images':images,'tests':test}));print(json.dumps({'result':'PREPARED','images':images,'tests':test}));raise SystemExit
prepared=json.loads((work/'prepared.json').read_text())
backup=json.loads(out(['python3',str(work/'backup.py')]));assert backup['result']=='PASS'
(work/'backup.json').write_text(json.dumps(backup));baseline()
run(compose(release,'--profile','migration','run','--rm','--no-deps','migrator','node','scripts/run-migration-with-secrets.mjs'))
try:
 start(release);switch(release);health();verification=verify(release,True)
 for item in gate['delta']:assert out(['docker','exec','bnbu-sports-production-backend-1','sha256sum','/app/dist/'+item['path']]).split()[0]==item['after'],item['path']
 assert out(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-portal-1'])==gate['baseImages']['portal']
 result={'result':'PASS','release':str(release),'previous':str(previous),'images':prepared['images'],'backup':backup,'verification':verification,'runtimeFilesVerified':len(gate['delta']),'health':'PASS','realAccountsDeletedByDeployment':0,'rollbackAvailable':True}
 (work/'deployment.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
except Exception:
 start(previous)
 if (base/'current').resolve()!=previous:switch(previous)
 health();raise
