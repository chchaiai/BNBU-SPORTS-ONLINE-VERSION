"""Publish the checked ended-session wording as a new immutable student version."""
from pathlib import Path
import hashlib, http.client, json, os, shutil, socket, subprocess, sys

BASE=Path('/opt/bnbu-sports-production')
WORK=Path('/home/ubuntu/checkin-ui-return-20261002')
PREVIOUS=BASE/'releases/checkin-ui-20261002'
RELEASE=BASE/'releases/checkin-ui-final-20261002'
SHARED=BASE/'shared/access-speed/student/_assets'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
inventory=lambda root:{p.relative_to(root).as_posix():sha(p) for p in root.rglob('*') if p.is_file()}
gate=json.loads((WORK/'validation.json').read_text())
assert os.geteuid()==0 and sys.argv[1:] in [[],['--rollback']]
def states():
    return subprocess.check_output(['docker','inspect','--format','{{.Name}} {{.Id}} {{.Image}} {{.State.StartedAt}} {{.State.Health.Status}}','bnbu-sports-production-backend-1','bnbu-sports-production-portal-1'],text=True).strip()
class LocalHTTPS(http.client.HTTPSConnection):
    def connect(self):
        self.sock=self._context.wrap_socket(socket.create_connection(('127.0.0.1',443),15),server_hostname=self.host)
def get(host,path):
    c=LocalHTTPS(host,timeout=15)
    try:
        c.request('GET',path); r=c.getresponse(); body=r.read(); assert r.status==200,(host,path,r.status)
        return body
    finally:c.close()
def switch(target):
    assert target in [PREVIOUS,RELEASE] and target.is_dir()
    link=BASE/'current-checkin-return-tmp'; assert not link.exists() and not link.is_symlink()
    link.symlink_to(target); os.replace(link,BASE/'current')
def verify(manifest):
    body=get('www.student.bnbusports.cn','/student/')
    assert hashlib.sha256(body).hexdigest()==manifest['htmlSha256']
    for name,digest in manifest['files'].items():
        assert hashlib.sha256(get('www.student.bnbusports.cn',manifest['base']+name)).hexdigest()==digest,name
    for host in ['www.student.bnbusports.cn','www.teacher.bnbusports.cn']:
        get(host,'/api/v1/health/ready')
    get('www.teacher.bnbusports.cn','/')
before=states(); assert before.count('healthy')==2
if sys.argv[1:]==['--rollback']:
    assert (BASE/'current').resolve()==RELEASE
    switch(PREVIOUS); verify(gate['before']); assert states()==before
    print(json.dumps({'result':'ROLLED_BACK','release':str(PREVIOUS)})); raise SystemExit
assert (BASE/'current').resolve()==PREVIOUS and not RELEASE.exists()
assert gate['tests']=={'passed':202,'failed':0,'smoke':88}
assert inventory(SHARED/gate['before']['version'])==gate['before']['files']
assert sha(PREVIOUS/'web/student/index.html')==gate['before']['htmlSha256']
assert gate['before']['files'].keys()==gate['after']['files'].keys()
assert {n for n in gate['before']['files'] if gate['before']['files'][n]!=gate['after']['files'][n]}=={'js/checkin-experience.js'}
assert sha(WORK/'checkin-experience.js')==gate['after']['files']['js/checkin-experience.js']
assert sha(WORK/'index.html')==gate['after']['htmlSha256']
baseline=inventory(PREVIOUS)
newAssets=SHARED/gate['after']['version']; assert not newAssets.exists()
shutil.copytree(SHARED/gate['before']['version'],newAssets)
shutil.copyfile(WORK/'checkin-experience.js',newAssets/'js/checkin-experience.js')
assert inventory(newAssets)==gate['after']['files']
shutil.copytree(PREVIOUS,RELEASE,symlinks=True)
shutil.copyfile(WORK/'index.html',RELEASE/'web/student/index.html')
candidate=inventory(RELEASE)
assert candidate.keys()==baseline.keys() and {n for n in candidate if candidate[n]!=baseline[n]}=={'web/student/index.html'}
try:
    switch(RELEASE); verify(gate['after']); assert states()==before and inventory(PREVIOUS)==baseline
    result={'result':'PASS','release':str(RELEASE),'previous':str(PREVIOUS),'studentVersion':gate['after']['version'],'immutableAssetsVerified':len(gate['after']['files']),'containersUnchanged':True,'rollbackAvailable':True,'businessDataWrites':0,'databaseMigrations':0,'tests':gate['tests']}
    (WORK/'deployment.json').write_text(json.dumps(result,indent=2)); print(json.dumps(result))
except Exception:
    switch(PREVIOUS); verify(gate['before']); raise
