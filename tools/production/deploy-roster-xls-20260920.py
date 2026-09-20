"""Deploy the validated roster XLS and filename fix with application rollback."""
import hashlib,json,os,re,shutil,subprocess,sys,time,urllib.request
from pathlib import Path
assert os.geteuid()==0 and sys.argv[1:] in [['--prepare'],['--apply']]
work=Path('/home/ubuntu/bnbu-roster-xls-20260920/bundle');base=Path('/opt/bnbu-sports-production')
gate=json.loads((work/'validation.json').read_text());previous=base/'releases'/gate['release'];release=base/'releases/roster-xls-20260920'
out=lambda a:subprocess.check_output(a,text=True).strip()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def run(a):subprocess.run(a,check=True)
def baseline():
 assert (base/'current').resolve()==previous
 for s in ['backend','portal']:assert out(['docker','inspect','--format','{{.Image}}',f'bnbu-sports-production-{s}-1'])==gate['baseImages'][s]
 for item in gate['delta']:
  if item['before']:assert out(['docker','exec','bnbu-sports-production-backend-1','sha256sum','/app/dist/'+item['path']]).split()[0]==item['before'],item['path']
 for item in gate['web']:
  p=previous/'web/student'/item['path']
  assert (sha(p) if p.exists() else None)==item['before'],item['path']
assert gate['checks']['httpPostgres']==4 and gate['checks']['backendUnit']==339
baseline()
for name,digest in gate['files'].items():
 p=(work/name).resolve(strict=True);assert p.is_relative_to(work) and sha(p)==digest,name
def switch(target):
 link=base/'current-roster-xls-tmp';assert not link.exists() and not link.is_symlink();link.symlink_to(target);os.replace(link,base/'current')
def start(target):
 run(['docker','compose','--project-directory',str(target),'up','-d','--no-deps','--no-build','--pull','never','backend','portal'])
 for _ in range(90):
  if all(out(['docker','inspect','--format','{{.State.Health.Status}}',f'bnbu-sports-production-{s}-1'])=='healthy' for s in ['backend','portal']):return
  time.sleep(1)
 raise RuntimeError('Readiness timeout')
if sys.argv[1]=='--prepare':
 assert not release.exists();images={}
 for s in ['backend','portal','migrator']:
  run(['docker','tag',gate['baseImages'][s],f'bnbu-{s}-roster-xls-base:20260920'])
  tag=f'bnbu-{s}-production:roster-xls-20260920'
  with (work/(s+'-build.log')).open('w') as log:subprocess.run(['docker','build','--pull=false','-t',tag,str(work/s)],check=True,stdout=log,stderr=subprocess.STDOUT)
  images[s]=out(['docker','image','inspect','--format','{{.Id}}',tag])
 run(['docker','run','--rm','--network','none','--read-only','--entrypoint','node','-v',str(work/'candidate-smoke.mjs')+':/app/candidate-smoke.mjs:ro',images['backend'],'candidate-smoke.mjs'])
 candidate='bnbu-roster-xls-portal-candidate'
 run(['docker','run','--rm','-d','--name',candidate,'--network','none','--read-only','--tmpfs','/tmp','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','512m',images['portal']])
 try:
  for _ in range(60):
   if out(['docker','inspect','--format','{{.State.Health.Status}}',candidate])=='healthy':break
   time.sleep(1)
  else:raise RuntimeError('Portal candidate unhealthy')
 finally:run(['docker','stop',candidate])
 baseline();shutil.copytree(previous,release)
 env=(release/'.env').read_text()
 for s,value in images.items():env,n=re.subn(r'(?m)^'+s.upper()+'_IMAGE=.*$',s.upper()+'_IMAGE='+value,env);assert n==1
 (release/'.env').write_text(env)
 for item in gate['web']:
  name=item['path'];(release/'web/student'/name).parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(work/'web/student'/name,release/'web/student'/name)
 assert sha(previous/'production.env')==sha(release/'production.env')
 (work/'prepared.json').write_text(json.dumps(images));print(json.dumps({'result':'PREPARED','images':images}));raise SystemExit
images=json.loads((work/'prepared.json').read_text())
backup=json.loads(out(['python3',str(work/'backup.py')]));assert backup['result']=='PASS';(work/'backup.json').write_text(json.dumps(backup))
baseline()
run(['docker','compose','--project-directory',str(release),'--profile','migration','run','--rm','--no-deps','migrator','node','scripts/run-migration-with-secrets.mjs'])
try:
 start(release);switch(release)
 for item in gate['delta']:assert out(['docker','exec','bnbu-sports-production-backend-1','sha256sum','/app/dist/'+item['path']]).split()[0]==item['after']
 for name,digest in gate['files'].items():
  if name.startswith('portal/dist/client/assets/'):
   with urllib.request.urlopen('https://www.teacher.bnbusports.cn/'+name.removeprefix('portal/dist/client/'),timeout=30) as r:assert r.status==200 and hashlib.sha256(r.read()).hexdigest()==digest,name
 for item in gate['web']:
  with urllib.request.urlopen('https://www.student.bnbusports.cn/student/'+item['path']+'?verify=roster-xls-20260920',timeout=30) as r:assert r.status==200 and hashlib.sha256(r.read()).hexdigest()==item['after']
 for url in ['https://www.teacher.bnbusports.cn/','https://www.student.bnbusports.cn/student/','https://www.teacher.bnbusports.cn/api/v1/health/ready']:
  with urllib.request.urlopen(url,timeout=30) as r:assert r.status==200
 result={'result':'PASS','previous':str(previous),'release':str(release),'images':images,'backup':backup,'migration':'0087_roster_xls','configurationAndBudgetUnchanged':True,'runtimeHashes':len(gate['delta']),'publicStudentHashes':len(gate['web']),'health':'PASS'}
 (work/'deployment.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
except Exception:
 switch(previous);start(previous);raise
