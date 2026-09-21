"""Deploy scoped student account and credit fixes on the pinned production baseline."""
import hashlib,json,os,re,shutil,subprocess,sys,time,urllib.request
from pathlib import Path
assert os.geteuid()==0 and sys.argv[1:] in [['--prepare'],['--apply'],['--rollback']]
work=Path('/home/ubuntu/bnbu-student-account-goals-20260920/bundle');base=Path('/opt/bnbu-sports-production')
gate=json.loads((work/'validation.json').read_text());previous=base/'releases/browser-access-four-20260920';release=base/'releases/student-account-goals-20260920'
out=lambda a:subprocess.check_output(a,text=True).strip()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
run=lambda a:subprocess.run(a,check=True)
def compose(target,*args):return ['docker','compose','--project-directory',str(target),*args]
def baseline():
 assert (base/'current').resolve()==previous
 assert out(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-backend-1'])==gate['baseBackend']
 for item in gate['delta']:assert out(['docker','exec','bnbu-sports-production-backend-1','sha256sum','/app/dist/'+item['path']]).split()[0]==item['before'],item['path']
 for item in gate['web']:assert sha(previous/'web/student'/item['path'])==item['before'],item['path']
def switch(target):
 link=base/'current-account-goals-tmp';assert not link.exists() and not link.is_symlink();link.symlink_to(target);os.replace(link,base/'current')
def start(target):
 run(compose(target,'up','-d','--no-deps','--no-build','--pull','never','backend'))
 for _ in range(90):
  if out(['docker','inspect','--format','{{.State.Health.Status}}','bnbu-sports-production-backend-1'])=='healthy':return
  time.sleep(1)
 raise RuntimeError('Backend readiness timeout')
def recredit(target,mode):
 result=out(compose(target,'run','--rm','--no-deps','--entrypoint','node','-v',str(work/'zero-course-recredit.mjs')+':/app/zero-course-recredit.mjs:ro','backend','/app/zero-course-recredit.mjs',mode))
 parsed=json.loads(result);assert parsed['result']=='PASS';return parsed
def health():
 for url in ['https://www.student.bnbusports.cn/student/','https://www.teacher.bnbusports.cn/','https://www.student.bnbusports.cn/api/v1/health/ready']:
  with urllib.request.urlopen(url,timeout=30) as r:assert r.status==200
if sys.argv[1]=='--rollback':
 assert (base/'current').resolve()==release;switch(previous);start(previous);recredit(previous,'--rollback');health();print('ROLLED_BACK');raise SystemExit
assert gate['checks']=={'backendUnit':342,'frontendUnit':100,'smoke':87,'candidateHttp':12,'browserScenarios':7}
for name,digest in gate['files'].items():assert sha(work/name)==digest,name
baseline()
if sys.argv[1]=='--prepare':
 assert not release.exists();images={}
 env=dict(line.split('=',1) for line in (previous/'.env').read_text().splitlines() if '=' in line)
 for service in ['backend','migrator']:
  run(['docker','tag',env[service.upper()+'_IMAGE'],f'bnbu-{service}-account-goals-base:20260920'])
  tag=f'bnbu-{service}-production:student-account-goals-20260920'
  with (work/(service+'-build.log')).open('w') as log:subprocess.run(['docker','build','--pull=false','-t',tag,str(work/service)],check=True,stdout=log,stderr=subprocess.STDOUT)
  images[service]=out(['docker','image','inspect','--format','{{.Id}}',tag])
 run(['docker','run','--rm','--network','none','--read-only','--entrypoint','node',images['backend'],'--input-type=module','-e',
  "import {selectCredits} from './dist/modules/v8/domain/crediting.js';const r=selectCredits([{id:'test',category:'COURSE_RELATED',businessDate:'2026-09-20',startedAt:'2026-09-20T00:00:00Z',actualSeconds:3600,valid:true,previouslySelected:false}],{minimumMinutes:30,weeklyLimit:3,dailyLimit:1,courseTarget:0,generalTarget:1200});if(r.courseMinutes!==0||r.generalMinutes!==60)throw Error('CREDIT');console.log('CANDIDATE_CREDIT_PASS')"])
 baseline();shutil.copytree(previous,release);text=(release/'.env').read_text()
 for service,value in images.items():text,n=re.subn(r'(?m)^'+service.upper()+'_IMAGE=.*$',service.upper()+'_IMAGE='+value,text);assert n==1
 (release/'.env').write_text(text)
 for item in gate['web']:shutil.copyfile(work/'web/student'/item['path'],release/'web/student'/item['path'])
 for name in ['production.env','compose.yml','nginx.conf']:assert sha(previous/name)==sha(release/name)
 (work/'prepared.json').write_text(json.dumps(images));print(json.dumps({'result':'PREPARED','images':images}));raise SystemExit
images=json.loads((work/'prepared.json').read_text())
backup=json.loads(out(['python3',str(work/'backup.py')]));assert backup['result']=='PASS';(work/'backup.json').write_text(json.dumps(backup))
baseline();run(compose(release,'--profile','migration','run','--rm','--no-deps','migrator','node','scripts/run-migration-with-secrets.mjs'))
recredited=False
try:
 start(release);switch(release);health()
 for item in gate['delta']:assert out(['docker','exec','bnbu-sports-production-backend-1','sha256sum','/app/dist/'+item['path']]).split()[0]==item['after']
 for item in gate['web']:
  with urllib.request.urlopen('https://www.student.bnbusports.cn/student/'+item['path']+'?verify=student-account-goals-20260920',timeout=30) as r:assert r.status==200 and hashlib.sha256(r.read()).hexdigest()==item['after']
 applied=recredit(release,'--apply');recredited=True
 verified=recredit(release,'--verify');health()
 result={'result':'PASS','release':str(release),'previous':str(previous),'images':images,'backup':backup,'migration':'0088_student_self_erasure',
  'runtimeHashes':len(gate['delta']),'studentPublicHashes':len(gate['web']),'health':'PASS','recredit':applied,'recreditVerification':verified,'realAccountsDeletedByDeployment':0,'rollbackAvailable':True}
 (work/'deployment.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
except Exception:
 switch(previous);start(previous)
 if recredited:recredit(previous,'--rollback')
 health();raise
