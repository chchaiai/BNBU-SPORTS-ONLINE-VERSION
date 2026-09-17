"""Deploy the validated daily-window change against pinned production images."""
import hashlib,json,os,re,shutil,subprocess,sys,time,urllib.request
from pathlib import Path
BASE=Path('/opt/bnbu-sports-production')
WORK=Path('/home/ubuntu/bnbu-course-settings-20260915')
PREVIOUS=BASE/'releases/server-video-20260915'
RELEASE=BASE/'releases/course-settings-20260915'
gate=json.loads((WORK/'validation.json').read_text())
assert os.geteuid()==0 and sys.argv[1:] in [['--prepare'],['--apply'],['--rollback']]
assert gate['checks']=={'http':'PASS','browser':'PASS','typecheck':'PASS','build':'PASS','migrationSafety':'PASS','baseline':'PASS'}
out=lambda args:subprocess.check_output(args,text=True).strip()
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
def run(args):subprocess.run(args,check=True)
def baseline():
 assert (BASE/'current').resolve()==PREVIOUS
 for service,image in gate['baseImages'].items():assert out(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-'+service+'-1'])==image
 assert out(['docker','exec','bnbu-sports-production-backend-1','sha256sum','/app/dist/modules/class-sections/application/class-sections.service.js']).split()[0]==gate['baseServiceSha']
def switch(target):
 link=BASE/'current-course-settings-tmp';assert not link.exists() and not link.is_symlink()
 link.symlink_to(target);os.replace(link,BASE/'current')
def healthy(names):
 for _ in range(90):
  if all(out(['docker','inspect','--format','{{.State.Health.Status}}',name])=='healthy' for name in names):return
  time.sleep(1)
 raise RuntimeError('Health timeout')
def start(target):
 run(['docker','compose','--project-directory',str(target),'up','-d','--no-deps','--no-build','--pull','never','backend','portal'])
 healthy(['bnbu-sports-production-backend-1','bnbu-sports-production-portal-1'])
def http(url):
 with urllib.request.urlopen(url,timeout=25) as response:
  assert response.status==200
  return response.read()
if sys.argv[1]=='--rollback':
 assert (BASE/'current').resolve()==RELEASE
 start(PREVIOUS);switch(PREVIOUS)
 print(json.dumps({'result':'ROLLED_BACK','databaseCompatibility':'Old backend still rejects published daily-window edits; migration retains all dates and data.'}));raise SystemExit
baseline()
for name,digest in gate['files'].items():
 p=(WORK/name).resolve(strict=True);assert p.is_relative_to(WORK) and sha(p)==digest,name
tags={s:'bnbu-'+s+'-production:course-settings-20260915' for s in ['backend','portal','migrator']}
if sys.argv[1]=='--prepare':
 assert not RELEASE.exists()
 for service,image in gate['baseImages'].items():run(['docker','tag',image,'bnbu-'+service+'-production:course-settings-base-20260915'])
 env=dict(line.split('=',1) for line in (PREVIOUS/'.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
 run(['docker','tag',env['MIGRATOR_IMAGE'],'bnbu-migrator-production:course-settings-base-20260915'])
 with (WORK/'build.log').open('w') as log:
  for service,tag in tags.items():subprocess.run(['docker','build','--pull=false','-t',tag,str(WORK/service)],check=True,stdout=log,stderr=subprocess.STDOUT)
 images={s:out(['docker','image','inspect','--format','{{.Id}}',tag]) for s,tag in tags.items()}
 run(['docker','run','--rm','--network','none','--read-only','--entrypoint','node',tags['backend'],'--input-type=module','-e',"await import('reflect-metadata');await import('./dist/modules/class-sections/application/class-sections.service.js');"])
 candidate='bnbu-course-settings-candidate'
 run(['docker','run','--rm','-d','--name',candidate,'--network','none','--read-only','--tmpfs','/tmp','--cap-drop','ALL','--security-opt','no-new-privileges',tags['portal']])
 try:healthy([candidate])
 finally:run(['docker','stop',candidate])
 shutil.copytree(PREVIOUS,RELEASE)
 content=(RELEASE/'.env').read_text()
 for service,image in images.items():
  content,n=re.subn(r'(?m)^'+service.upper()+r'_IMAGE=.*$',service.upper()+'_IMAGE='+image,content);assert n==1
 (RELEASE/'.env').write_text(content)
 for name in ['compose.yml','production.env','nginx.conf']:assert (RELEASE/name).read_bytes()==(PREVIOUS/name).read_bytes()
 (WORK/'prepared.json').write_text(json.dumps(images,indent=2))
 print(json.dumps({'result':'PREPARED','images':images}));raise SystemExit
images=json.loads((WORK/'prepared.json').read_text())
for service,tag in tags.items():assert out(['docker','image','inspect','--format','{{.Id}}',tag])==images[service]
backup=json.loads(out(['python3',str(WORK/'backup.py')]))
assert backup['result']=='PASS';(WORK/'backup.json').write_text(json.dumps(backup))
baseline()
run(['docker','compose','--project-directory',str(RELEASE),'--profile','migration','run','--rm','--no-deps','migrator','node','scripts/run-migration-with-secrets.mjs'])
try:
 start(RELEASE)
 assets=0
 for name,digest in gate['files'].items():
  if name.startswith('portal/dist/client/assets/'):
   assert hashlib.sha256(http('https://www.teacher.bnbusports.cn/'+name.removeprefix('portal/dist/client/'))).hexdigest()==digest,name
   assets+=1
  if name.startswith('backend/dist/'):
   assert out(['docker','exec','bnbu-sports-production-backend-1','sha256sum','/app/'+name.removeprefix('backend/')]).split()[0]==digest,name
 for url in ['https://www.teacher.bnbusports.cn/','https://www.student.bnbusports.cn/student/','https://www.student.bnbusports.cn/api/v1/health/ready']:http(url)
 for service in ['portal','backend']:assert out(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-'+service+'-1'])==images[service]
 switch(RELEASE)
 result={'result':'PASS','release':str(RELEASE),'previous':str(PREVIOUS),'images':images,'publicAssetsVerified':assets,'backendHashes':'PASS','health':'PASS','migration':'0080_published_course_daily_window','backup':backup}
 (WORK/'deployment.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
except Exception:
 assert (BASE/'current').resolve() in [PREVIOUS,RELEASE]
 start(PREVIOUS)
 if (BASE/'current').resolve()!=PREVIOUS:switch(PREVIOUS)
 print(json.dumps({'result':'FAILED_ROLLED_BACK'}));raise
