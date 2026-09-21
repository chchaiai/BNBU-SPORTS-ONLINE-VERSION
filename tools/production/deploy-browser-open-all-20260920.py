"""Publish a student browser access policy on a pinned release with automatic rollback."""
from pathlib import Path
import hashlib,json,os,shutil,subprocess,sys,urllib.request
BASE=Path('/opt/bnbu-sports-production');WORK=Path('/home/ubuntu/bnbu-browser-open-all-20260920/bundle');RELEASE=BASE/'releases/browser-open-all-20260920'
assert os.geteuid()==0 and sys.argv[1:] in [['--apply'],['--rollback']]
gate=json.loads((WORK/'validation.json').read_text());previous=BASE/'releases'/gate['previous']
assert previous==BASE/'releases/browser-open-20260920'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def state(service):return subprocess.check_output(['docker','inspect','--format','{{.Id}} {{.Image}} {{.State.StartedAt}} {{.State.Health.Status}}','bnbu-sports-production-'+service+'-1'],text=True).strip()
def switch(target):
 assert target in [previous,RELEASE] and target.is_dir()
 link=BASE/'current-browser-open-tmp';assert not link.exists() and not link.is_symlink();link.symlink_to(target);os.replace(link,BASE/'current')
def http(url):
 with urllib.request.urlopen(url,timeout=25) as r:assert r.status==200;return r.read(),r.headers.get('Cache-Control','')
if sys.argv[1]=='--rollback':
 assert (BASE/'current').resolve()==RELEASE;switch(previous);print(json.dumps({'result':'ROLLED_BACK','release':str(previous)}));raise SystemExit
assert gate['checks']=={'tests':100,'smoke':87,'browserScenarios':15}
assert (BASE/'current').resolve()==previous and not RELEASE.exists()
assert set(gate['files'])=={'js/student-device.js'}
for name,digest in gate['files'].items():assert sha(WORK/'student'/name)==digest
for name,digest in gate['baseline'].items():assert sha(previous/'web/student'/name)==digest
states={s:state(s) for s in ['backend','portal']};assert all(v.endswith('healthy') for v in states.values())
shutil.copytree(previous,RELEASE)
for name in gate['files']:shutil.copyfile(WORK/'student'/name,RELEASE/'web/student'/name)
for name in ['.env','production.env','compose.yml','nginx.conf']:assert sha(previous/name)==sha(RELEASE/name)
# No other copied release file may differ, including concurrent portal work.
changes=[]
for p in previous.rglob('*'):
 if p.is_file() and sha(p)!=sha(RELEASE/p.relative_to(previous)):changes.append(str(p.relative_to(previous)))
assert set(changes)=={'web/student/'+name for name in gate['files']},changes
try:
 switch(RELEASE)
 for name,digest in gate['files'].items():
  for suffix in ['', '?verify=browser-open-all-20260920']:
   body,cache=http('https://www.student.bnbusports.cn/student/'+name+suffix);assert hashlib.sha256(body).hexdigest()==digest,name;assert 'no-store' in cache,cache
 for url in ['https://www.student.bnbusports.cn/student/','https://www.student.bnbusports.cn/api/v1/health/ready','https://www.teacher.bnbusports.cn/api/v1/health/ready']:http(url)
 assert all(state(s)==v for s,v in states.items())
 result={'result':'PASS','release':str(RELEASE),'previous':str(previous),'files':gate['files'],'publicHashes':'PASS','health':'PASS','runtimeUnchanged':True,'realStudentBusinessWrites':0,'migrationExecuted':False,'rollbackAvailable':True}
 (WORK/'deployment.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
except Exception:
 switch(previous);http('https://www.student.bnbusports.cn/api/v1/health/ready');print('FAILED_ROLLED_BACK');raise
