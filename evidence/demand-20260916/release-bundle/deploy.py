"""Pinned demand release, private backup, compatible migrations and application rollback."""
import hashlib,json,os,re,shutil,subprocess,sys,time,urllib.request
from pathlib import Path
assert os.geteuid()==0 and sys.argv[1:] in [['--prepare'],['--apply']]
work=Path('/home/ubuntu/bnbu-demand-20260916/release-bundle');base=Path('/opt/bnbu-sports-production')
gate=json.loads((work/'validation.json').read_text());previous=base/'releases'/gate['previous'];release=base/'releases'/gate['release']
assert previous.name=='student-origin-20260916' and release.name=='demand-20260916'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
out=lambda args:subprocess.check_output(args,text=True).strip()
def run(args):subprocess.run(args,check=True)
def baseline():
 assert (base/'current').resolve()==previous
 for service in ['backend','portal']:assert out(['docker','inspect','--format','{{.Image}}',f'bnbu-sports-production-{service}-1'])==gate['baseImages'][service]
 for item in gate['delta']['student']:
  p=previous/'web/student'/item['path'];assert (sha(p) if p.exists() else None)==item['before'],item['path']
 for item in gate['delta']['backend']:
  if item['before'] is not None:assert out(['docker','exec','bnbu-sports-production-backend-1','sha256sum','/app/dist/'+item['path']]).split()[0]==item['before'],item['path']
baseline()
for name,digest in gate['files'].items():
 p=(work/name).resolve(strict=True);assert p.is_relative_to(work) and sha(p)==digest,name
def http(url):
 with urllib.request.urlopen(url,timeout=30) as r:assert r.status==200;return r.read()
def switch(target):
 p=base/'current-demand-tmp';assert not p.exists() and not p.is_symlink();p.symlink_to(target);os.replace(p,base/'current')
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
  run(['docker','tag',gate['baseImages'][service],f'bnbu-{service}-demand-base:20260916'])
  tag=f'bnbu-{service}-production:demand-20260916'
  with (work/(service+'-build.log')).open('w') as log:subprocess.run(['docker','build','--pull=false','-t',tag,str(work/service)],check=True,stdout=log,stderr=subprocess.STDOUT)
  images[service]=out(['docker','image','inspect','--format','{{.Id}}',tag])
 candidate='bnbu-demand-portal-candidate'
 run(['docker','run','--rm','-d','--name',candidate,'--network','none','--read-only','--tmpfs','/tmp','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','512m',images['portal']])
 try:
  for _ in range(60):
   if out(['docker','inspect','--format','{{.State.Health.Status}}',candidate])=='healthy':break
   time.sleep(1)
  else:raise RuntimeError('Portal candidate failed')
 finally:run(['docker','stop',candidate])
 baseline();shutil.copytree(previous,release)
 for p in (work/'web').rglob('*'):
  if p.is_file():target=release/'web'/p.relative_to(work/'web');target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,target)
 env=(release/'.env').read_text()
 for service,image in images.items():env,n=re.subn(r'(?m)^'+service.upper()+'_IMAGE=.*$',service.upper()+'_IMAGE='+image,env);assert n==1
 (release/'.env').write_text(env);(work/'prepared.json').write_text(json.dumps(images));print(json.dumps({'result':'PREPARED','images':images}));raise SystemExit
images=json.loads((work/'prepared.json').read_text())
backup=json.loads(out(['python3',str(work/'backup.py')]));assert backup['result']=='PASS';(work/'backup.json').write_text(json.dumps(backup))
baseline()
run(['docker','compose','--project-directory',str(release),'--profile','migration','run','--rm','--no-deps','migrator','node','scripts/run-migration-with-secrets.mjs'])
try:
 start(release);switch(release)
 for service in ['backend','portal']:assert out(['docker','inspect','--format','{{.Image}}',f'bnbu-sports-production-{service}-1'])==images[service]
 for item in gate['delta']['backend']:assert out(['docker','exec','bnbu-sports-production-backend-1','sha256sum','/app/dist/'+item['path']]).split()[0]==item['after']
 for item in gate['delta']['student']:assert hashlib.sha256(http('https://www.student.bnbusports.cn/student/'+item['path']+'?verify=demand-20260916')).hexdigest()==item['after']
 for url in ['https://www.teacher.bnbusports.cn/','https://www.student.bnbusports.cn/student/','https://www.teacher.bnbusports.cn/api/v1/health/ready','https://bnbusports.cn/']:http(url)
 result={'result':'PASS','previous':str(previous),'release':str(release),'images':images,'backup':backup,'migrations':['0081','0082'],'hashes':'PASS','health':'PASS'}
 (work/'deployment.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
except Exception:
 if (base/'current').resolve() in [previous,release]:switch(previous);start(previous)
 raise
