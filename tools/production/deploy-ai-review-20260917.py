"""Pinned AI advisory release with private backup and application rollback."""
import hashlib,json,os,re,shutil,subprocess,sys,time,urllib.request
from pathlib import Path
assert os.geteuid()==0 and sys.argv[1:] in [['--prepare'],['--apply']]
work=Path('/home/ubuntu/bnbu-ai-review-20260917/bundle');base=Path('/opt/bnbu-sports-production')
gate=json.loads((work/'validation.json').read_text());previous=base/'releases'/gate['previous'];release=base/'releases/ai-review-20260917'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
out=lambda a:subprocess.check_output(a,text=True).strip()
def run(a):subprocess.run(a,check=True)
def baseline():
 assert (base/'current').resolve()==previous
 for s in ['backend','portal']:assert out(['docker','inspect','--format','{{.Image}}',f'bnbu-sports-production-{s}-1'])==gate['baseImages'][s]
 for item in gate['delta']:
  if item['before']:assert out(['docker','exec','bnbu-sports-production-backend-1','sha256sum','/app/dist/'+item['path']]).split()[0]==item['before'],item['path']
baseline()
for name,digest in gate['files'].items():
 p=(work/name).resolve(strict=True);assert p.is_relative_to(work) and sha(p)==digest,name
def switch(target):
 p=base/'current-ai-review-tmp';assert not p.exists() and not p.is_symlink();p.symlink_to(target);os.replace(p,base/'current')
def start(target):
 run(['docker','compose','--project-directory',str(target),'up','-d','--no-deps','--no-build','--pull','never','backend','portal'])
 for _ in range(90):
  if all(out(['docker','inspect','--format','{{.State.Health.Status}}',f'bnbu-sports-production-{s}-1'])=='healthy' for s in ['backend','portal']):return
  time.sleep(1)
 raise RuntimeError('Readiness timeout')
if sys.argv[1]=='--prepare':
 assert not release.exists()
 images={}
 for service in ['backend','portal','migrator']:
  run(['docker','tag',gate['baseImages'][service],f'bnbu-{service}-ai-review-base:20260917'])
  tag=f'bnbu-{service}-production:ai-review-20260917'
  with (work/(service+'-build.log')).open('w') as log:subprocess.run(['docker','build','--pull=false','-t',tag,str(work/service)],check=True,stdout=log,stderr=subprocess.STDOUT)
  images[service]=out(['docker','image','inspect','--format','{{.Id}}',tag])
 candidate='bnbu-ai-review-portal-candidate'
 run(['docker','run','--rm','-d','--name',candidate,'--network','none','--read-only','--tmpfs','/tmp','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','512m',images['portal']])
 try:
  for _ in range(60):
   if out(['docker','inspect','--format','{{.State.Health.Status}}',candidate])=='healthy':break
   time.sleep(1)
  else:raise RuntimeError('Portal candidate unhealthy')
 finally:run(['docker','stop',candidate])
 baseline();shutil.copytree(previous,release)
 env=(release/'.env').read_text()
 for s,image in images.items():env,n=re.subn(r'(?m)^'+s.upper()+'_IMAGE=.*$',s.upper()+'_IMAGE='+image,env);assert n==1
 (release/'.env').write_text(env)
 # Keep prior release's secret unchanged so rollback uses its original schema.
 source=Path('/etc/bnbu-sports-production/secrets/runtime-aoksend-20260915.json')
 target=Path('/etc/bnbu-sports-production/secrets/runtime-ai-review-20260917.json')
 data=json.loads(source.read_text());data['TOKENHUB_API_KEY']=Path('/etc/bnbu-sports-production/secrets/ai-review-tokenhub.key').read_text().strip()
 fd=os.open(target,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o640)
 with os.fdopen(fd,'w') as file:json.dump(data,file)
 os.chown(target,0,10001)
 compose=(release/'compose.yml').read_text();assert compose.count(str(source))==1
 (release/'compose.yml').write_text(compose.replace(str(source),str(target)))
 env=(release/'production.env').read_text();assert 'AI_REVIEW_ENABLED=' not in env
 (release/'production.env').write_text(env+'\nAI_REVIEW_ENABLED=true\nAI_REVIEW_BUDGET_FEN=490000\n')
 (work/'prepared.json').write_text(json.dumps(images));print(json.dumps({'result':'PREPARED','images':images}));raise SystemExit
images=json.loads((work/'prepared.json').read_text())
backup=json.loads(out(['python3',str(work/'backup.py')]));assert backup['result']=='PASS';(work/'backup.json').write_text(json.dumps(backup))
baseline()
run(['docker','compose','--project-directory',str(release),'--profile','migration','run','--rm','--no-deps','migrator','node','scripts/run-migration-with-secrets.mjs'])
try:
 start(release);switch(release)
 for s in ['backend','portal']:assert out(['docker','inspect','--format','{{.Image}}',f'bnbu-sports-production-{s}-1'])==images[s]
 for item in gate['delta']:assert out(['docker','exec','bnbu-sports-production-backend-1','sha256sum','/app/dist/'+item['path']]).split()[0]==item['after']
 for url in ['https://www.teacher.bnbusports.cn/','https://www.student.bnbusports.cn/student/','https://www.teacher.bnbusports.cn/api/v1/health/ready']:
  with urllib.request.urlopen(url,timeout=30) as response:assert response.status==200
 result={'result':'PASS','previous':str(previous),'release':str(release),'images':images,'backup':backup,'migration':'0083_ai_review_advisory','hashes':'PASS','health':'PASS','budgetReservationLimitFen':490000}
 (work/'deployment.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
except Exception:
 switch(previous);start(previous);raise
