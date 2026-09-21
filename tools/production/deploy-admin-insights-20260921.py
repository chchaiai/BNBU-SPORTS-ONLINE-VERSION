"""Publish only the validated monitoring and management delta; retain rollback."""
from pathlib import Path
import hashlib,json,os,re,shutil,subprocess,sys,time,urllib.request
assert os.geteuid()==0 and sys.argv[1:] in [['--prepare'],['--apply'],['--rollback']]
base=Path('/opt/bnbu-sports-production');work=Path('/home/ubuntu/bnbu-admin-insights-20260921/bundle')
gate=json.loads((work/'validation.json').read_text());previous=base/'releases'/gate['previous'];release=base/'releases/admin-insights-20260921'
out=lambda args:subprocess.check_output(args,text=True).strip()
run=lambda args:subprocess.run(args,check=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def compose(target,*args):return ['docker','compose','--project-directory',str(target),*args]
def baseline():
 assert (base/'current').resolve()==previous
 for service in ['Backend','Portal']:assert out(['docker','inspect','--format','{{.Image}}',f'bnbu-sports-production-{service.lower()}-1'])==gate['base'+service]
 for row in gate['delta']:
  if row['before']:assert out(['docker','exec','bnbu-sports-production-backend-1','sha256sum','/app/dist/'+row['path']]).split()[0]==row['before'],row['path']
 for row in gate['web']:assert sha(previous/'web/student'/row['path'])==row['before']
def switch(target):
 link=base/'current-admin-insights-tmp';assert not link.exists() and not link.is_symlink();link.symlink_to(target);os.replace(link,base/'current')
def start(target):
 run(compose(target,'up','-d','--no-deps','--no-build','--pull','never','backend','portal'))
 for _ in range(90):
  if all(out(['docker','inspect','--format','{{.State.Health.Status}}',f'bnbu-sports-production-{s}-1'])=='healthy' for s in ['backend','portal']):return
  time.sleep(1)
 raise RuntimeError('Application health timeout')
def http(url):
 with urllib.request.urlopen(url,timeout=30) as r:assert r.status==200;return r.read()
def health():
 for url in ['https://www.teacher.bnbusports.cn/','https://www.student.bnbusports.cn/student/','https://www.teacher.bnbusports.cn/api/v1/health/ready']:http(url)
if sys.argv[1]=='--rollback':
 assert (base/'current').resolve()==release;start(previous);switch(previous);health();print('ROLLED_BACK');raise SystemExit
assert gate['checks']=={'backendUnit':343,'portalRegression':13,'candidateHttp':10,'browser':8,'types':'PASS','contract':'PASS','build':'PASS','migrationSafety':'PASS'}
for name,digest in gate['files'].items():assert sha(work/name)==digest,name
baseline()
if sys.argv[1]=='--prepare':
 assert not release.exists();env=dict(line.split('=',1) for line in (previous/'.env').read_text().splitlines() if '=' in line);images={}
 for service in ['backend','portal','migrator']:
  run(['docker','tag',env[service.upper()+'_IMAGE'],f'bnbu-{service}-insights-base:20260921'])
  tag=f'bnbu-{service}-production:admin-insights-20260921'
  with (work/(service+'-build.log')).open('w') as log:subprocess.run(['docker','build','--pull=false','-t',tag,str(work/service)],check=True,stdout=log,stderr=subprocess.STDOUT)
  images[service]=out(['docker','image','inspect','--format','{{.Id}}',tag])
 candidate='bnbu-insights-portal-candidate';run(['docker','run','--rm','-d','--name',candidate,'--network','none','--read-only','--tmpfs','/tmp','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','512m','--health-interval','2s',images['portal']])
 try:
  for _ in range(45):
   if out(['docker','inspect','--format','{{.State.Health.Status}}',candidate])=='healthy':break
   time.sleep(1)
  else:raise RuntimeError('Portal candidate unhealthy')
 finally:run(['docker','stop',candidate])
 baseline();shutil.copytree(previous,release);content=(release/'.env').read_text()
 for service,image in images.items():content,n=re.subn(r'(?m)^'+service.upper()+'_IMAGE=.*$',service.upper()+'_IMAGE='+image,content);assert n==1
 (release/'.env').write_text(content)
 for row in gate['web']:shutil.copyfile(work/'web/student'/row['path'],release/'web/student'/row['path'])
 for name in ['compose.yml','production.env','nginx.conf']:assert sha(previous/name)==sha(release/name)
 (work/'prepared.json').write_text(json.dumps(images));print(json.dumps({'result':'PREPARED','images':images}));raise SystemExit
images=json.loads((work/'prepared.json').read_text())
backup=json.loads(out(['python3',str(work/'backup.py')]));assert backup['result']=='PASS';(work/'backup.json').write_text(json.dumps(backup))
baseline();run(compose(release,'--profile','migration','run','--rm','--no-deps','migrator','node','scripts/run-migration-with-secrets.mjs'))
try:
 verification=json.loads(out(compose(release,'run','--rm','--no-deps','--entrypoint','node','-v',str(work/'verify.mjs')+':/app/verify-admin-insights.mjs:ro','backend','/app/verify-admin-insights.mjs')));assert verification['result']=='PASS'
 start(release);switch(release);health()
 for row in gate['delta']:assert out(['docker','exec','bnbu-sports-production-backend-1','sha256sum','/app/dist/'+row['path']]).split()[0]==row['after'],row['path']
 for row in gate['web']:assert hashlib.sha256(http('https://www.student.bnbusports.cn/student/'+row['path']+'?verify=admin-insights-20260921')).hexdigest()==row['after']
 assets={n:d for n,d in gate['files'].items() if n.startswith('portal/dist/client/assets/')};assert assets
 for name,digest in assets.items():assert hashlib.sha256(http('https://www.teacher.bnbusports.cn/'+name.removeprefix('portal/dist/client/'))).hexdigest()==digest,name
 result={'result':'PASS','release':str(release),'previous':str(previous),'images':images,'backup':backup,'migration':'0089_teacher_notes','verification':verification,'runtimeHashes':len(gate['delta']),'publicPortalAssets':len(assets),'studentPublicFiles':len(gate['web']),'health':'PASS','rollbackAvailable':True}
 (work/'deployment.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
except Exception:
 start(previous);switch(previous);health();raise
