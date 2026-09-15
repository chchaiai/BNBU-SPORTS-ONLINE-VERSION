"""Deploy the validated Bug15 overlay with pinned baselines and application rollback."""
import hashlib, json, os, re, shutil, subprocess, sys, time, urllib.request
from pathlib import Path

BASE=Path('/opt/bnbu-sports-production')
WORK=Path('/home/ubuntu/bnbu-bug-20260915')
assert os.geteuid()==0 and sys.argv[1:] in [['--prepare'],['--apply'],['--rollback']]
gate=json.loads((WORK/'validation.json').read_text())
previous=BASE/'releases'/gate['previous'];release=BASE/'releases'/gate['release']
assert previous.name=='email-first-20260914' and release.name=='bug-20260915'
assert re.fullmatch('[a-f0-9]{40}',gate['sourceCommit'])
assert gate['localChecks']=='PASS'
def output(args):return subprocess.check_output(args,text=True).strip()
def run(args):subprocess.run(args,check=True)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def switch(target):
 link=BASE/'current-bug15-tmp';assert not link.exists() and not link.is_symlink()
 link.symlink_to(target);os.replace(link,BASE/'current')
def start(target):
 run(['docker','compose','--project-directory',str(target),'up','-d','--no-build','--pull','never','backend','portal'])
 for _ in range(90):
  if all(output(['docker','inspect','--format','{{.State.Health.Status}}','bnbu-sports-production-'+service+'-1'])=='healthy' for service in ['backend','portal']):return
  time.sleep(1)
 raise RuntimeError('Health timeout')
def http(url):
 with urllib.request.urlopen(url,timeout=25) as response:
  assert response.status==200
  return response.read()
if sys.argv[1]=='--rollback':
 assert (BASE/'current').resolve() in [previous,release]
 switch(previous);start(previous);print(json.dumps({'result':'ROLLED_BACK'}));raise SystemExit
assert (BASE/'current').resolve()==previous
for service,expected in gate['baseImages'].items():
 assert output(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-'+service+'-1'])==expected
for name,expected in gate['baselineStudent'].items():
 target=previous/'web'/name
 assert (sha(target) if target.exists() else None)==expected,name
for name,expected in gate['files'].items():
 target=(WORK/name).resolve(strict=True);assert target.is_relative_to(WORK) and sha(target)==expected,name
tags={service:'bnbu-'+service+'-production:bug-20260915' for service in ['backend','portal']}
if sys.argv[1]=='--prepare':
 assert not release.exists()
 for service,tag in tags.items():run(['docker','build','--pull=false','-t',tag,str(WORK/service)])
 run(['docker','run','--rm','--network','none','--read-only','--entrypoint','node',tags['backend'],'--input-type=module','-e',"await import('reflect-metadata');await import('./dist/modules/users/application/student-identity-normalizer.js');await import('./dist/modules/course-invites/domain/invite-timing.js');"])
 result={'result':'PASS','sourceCommit':gate['sourceCommit'],'images':{service:output(['docker','image','inspect','--format','{{.Id}}',tag]) for service,tag in tags.items()}}
 (WORK/'prepared.json').write_text(json.dumps(result,indent=2));print(json.dumps(result));raise SystemExit
prepared=json.loads((WORK/'prepared.json').read_text());assert prepared['result']=='PASS' and prepared['sourceCommit']==gate['sourceCommit']
for service,tag in tags.items():assert output(['docker','image','inspect','--format','{{.Id}}',tag])==prepared['images'][service]
assert not release.exists()
run(['python3',str(WORK/'backup-before-bugfix.py')])
shutil.copytree(previous,release)
for name in gate['studentFiles']:
 target=release/'web'/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(WORK/'web'/name,target)
env=release/'.env';content=env.read_text()
for service,tag in tags.items():
 content,count=re.subn(r'(?m)^'+service.upper()+r'_IMAGE=.*$',service.upper()+'_IMAGE='+tag,content);assert count==1
env.write_text(content)
for name in ['production.env','compose.yml','nginx.conf']:assert (previous/name).read_bytes()==(release/name).read_bytes()
try:
 start(release);switch(release)
 for url in ['https://www.student.bnbusports.cn/student/','https://www.teacher.bnbusports.cn/','https://www.student.bnbusports.cn/api/v1/health/ready','https://bnbusports.cn/']:http(url)
 for name in gate['studentFiles']:assert hashlib.sha256(http('https://www.student.bnbusports.cn/'+name+'?release=bug15')).hexdigest()==gate['files']['web/'+name]
 result={'result':'PASS','sourceCommit':gate['sourceCommit'],'previous':str(previous),'release':str(release),'images':prepared['images'],'studentHashes':'PASS','migrationExecuted':False,'rollbackExercised':False}
 (WORK/'deployment-result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
except Exception:
 switch(previous);start(previous);print(json.dumps({'result':'FAILED_ROLLED_BACK'}));raise
