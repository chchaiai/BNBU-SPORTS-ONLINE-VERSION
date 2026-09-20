"""Publish two validated static modules with pinned baseline and automatic rollback."""
import hashlib,json,os,shutil,subprocess,sys,time,urllib.request
from pathlib import Path
assert os.geteuid()==0
base=Path('/opt/bnbu-sports-production')
work=Path('/home/ubuntu/record-history-20260918')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def containers():
    return {name:subprocess.check_output(['docker','inspect','--format','{{.Id}} {{.Image}} {{.State.StartedAt}} {{.State.Health.Status}}','bnbu-sports-production-'+name+'-1'],text=True).strip() for name in ['backend','portal']}
if sys.argv[1:] == ['--inspect']:
    previous=(base/'current').resolve()
    print(json.dumps({'release':previous.name,'files':{p:sha(previous/'web/student'/p) for p in ['js/api.js','js/screens/checkin.js']},'containers':containers()}));raise SystemExit
assert sys.argv[1:] == ['--apply']
gate=json.loads((work/'manifest.json').read_text())
assert json.loads((work/'candidate.json').read_text())['result']=='PASS'
previous=base/'releases'/gate['previousRelease'];release=base/'releases'/gate['release']
assert (base/'current').resolve()==previous and not release.exists()
assert set(gate['files'])==set(gate['baseline'])=={'js/api.js','js/screens/checkin.js'}
for name,digest in gate['baseline'].items():assert sha(previous/'web/student'/name)==digest,name
for name,digest in gate['files'].items():assert sha(work/'bundle'/name)==digest,name
before=containers();assert all(value.endswith('healthy') for value in before.values())
shutil.copytree(previous,release)
for name in gate['files']:shutil.copyfile(work/'bundle'/name,release/'web/student'/name)
for name in ['.env','production.env','compose.yml','nginx.conf']:assert sha(previous/name)==sha(release/name)
shutil.copyfile(work/'manifest.json',release/'record-history-manifest.json')
def switch(target):
    link=base/'current-record-history-tmp';assert not link.exists() and not link.is_symlink()
    link.symlink_to(target);os.replace(link,base/'current')
def get(url):
    with urllib.request.urlopen(url,timeout=25) as response:assert response.status==200;return response.read()
try:
    assert (base/'current').resolve()==previous
    switch(release)
    for name,digest in gate['files'].items():
        for suffix in ['', '?release='+gate['release']]:
            assert hashlib.sha256(get('https://www.student.bnbusports.cn/student/'+name+suffix)).hexdigest()==digest,name
    for url in ['https://www.student.bnbusports.cn/student/','https://www.student.bnbusports.cn/api/v1/health/ready','https://www.teacher.bnbusports.cn/api/v1/health/ready']:get(url)
    assert containers()==before
    result={'result':'PASS','release':str(release),'previous':str(previous),'publicHashes':gate['files'],'containersUnchanged':True,'health':'PASS','databaseWrites':0,'sourceHead':gate['sourceHead']}
    (work/'deployment.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
except Exception:
    switch(previous)
    for name,digest in gate['baseline'].items():assert hashlib.sha256(get('https://www.student.bnbusports.cn/student/'+name+'?rollback='+str(time.time()))).hexdigest()==digest
    assert containers()==before
    print(json.dumps({'result':'FAILED_ROLLED_BACK'}));raise
