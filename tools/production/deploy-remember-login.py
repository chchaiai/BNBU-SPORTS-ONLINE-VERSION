"""Deploy the student login persistence fix without replacing runtime services."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request

BASE = Path('/opt/bnbu-sports-production')
WORK = Path('/home/ubuntu/bnbu-remember-login-20260914')
assert os.geteuid() == 0
assert sys.argv[1:] in [['--prepare'], ['--apply'], ['--rollback']]
gate = json.loads((WORK / 'validation.json').read_text())
assert gate['checks'] == {'studentSmoke':87,'focusedTests':20,'diffCheck':'PASS'}
assert gate['previous'] == 'invite-duration-20260914'
assert gate['release'] == 'remember-login-20260914'
assert len(gate['sourceCommit']) == 40
previous = BASE / 'releases' / gate['previous']
release = BASE / 'releases' / gate['release']

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def switch(target):
    link = BASE / 'current-remember-login-tmp'
    assert not link.exists() and not link.is_symlink()
    link.symlink_to(target)
    os.replace(link, BASE / 'current')

def http(url):
    with urllib.request.urlopen(url, timeout=25) as response:
        assert response.status == 200
        return response.read()

if sys.argv[1] == '--rollback':
    assert (BASE / 'current').resolve() in [previous, release]
    switch(previous)
    print(json.dumps({'result':'ROLLED_BACK','release':str(previous)}))
    raise SystemExit(0)
assert (BASE / 'current').resolve() == previous
for service, digest in gate['baseImages'].items():
    actual = subprocess.check_output(['docker','inspect','--format','{{.Image}}',f'bnbu-sports-production-{service}-1'],text=True).strip()
    assert actual == digest
for name, digest in gate['baselineStudent'].items():
    assert sha(previous / 'web' / name) == digest
for name, digest in gate['files'].items():
    path = (WORK / name).resolve(strict=True)
    assert path.is_relative_to(WORK) and sha(path) == digest
assert not release.exists()
if sys.argv[1] == '--prepare':
    result = {'result':'PASS','sourceCommit':gate['sourceCommit'],'phase':'PREPARED'}
    (WORK / 'prepared.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result))
    raise SystemExit(0)
prepared = json.loads((WORK / 'prepared.json').read_text())
assert prepared['result'] == 'PASS' and prepared['sourceCommit'] == gate['sourceCommit']
shutil.copytree(previous, release)
for name in gate['studentFiles']:
    shutil.copyfile(WORK / 'web' / name, release / 'web' / name)
for name in ['.env','production.env','compose.yml','nginx.conf']:
    assert (release / name).read_bytes() == (previous / name).read_bytes()
try:
    switch(release)
    urls = ['https://www.student.bnbusports.cn/student/','https://www.student.bnbusports.cn/api/v1/health/ready','https://www.teacher.bnbusports.cn/']
    for url in urls:
        http(url)
    for name in gate['studentFiles']:
        assert hashlib.sha256(http('https://www.student.bnbusports.cn/'+name)).hexdigest() == gate['files']['web/'+name]
    result = {'result':'PASS','sourceCommit':gate['sourceCommit'],'phase':'DEPLOYED','release':str(release),'previous':str(previous),'health':{url:200 for url in urls},'studentHashes':'PASS','servicesRestarted':False,'migrationExecuted':False}
    (WORK / 'deployment-result.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result))
except Exception:
    switch(previous)
    raise
