"""Deploy the checked video overlay and additive compatibility migration."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import urllib.request

WORK = Path('/home/ubuntu/bnbu-server-video-20260915')
BASE = Path('/opt/bnbu-sports-production')
RELEASE = BASE / 'releases/server-video-20260915'
TAG = 'bnbu-backend-production:server-video-20260915'
MIGRATOR = 'bnbu-migrator-production:server-video-20260915'
gate = json.loads((WORK / 'validation.json').read_text())
previous = Path(gate['previous']).resolve(strict=True)
assert os.geteuid() == 0 and sys.argv[1:] in [['--prepare'], ['--apply']]
assert previous.is_relative_to(BASE / 'releases') and previous != RELEASE
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
output = lambda args: subprocess.check_output(args, text=True).strip()
def run(args):
    subprocess.run(args, check=True)
def check_baseline():
    assert (BASE / 'current').resolve() == previous
    assert output(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-backend-1']) == gate['baseImage']
    assert output(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-portal-1']) == gate['portalImage']
    for name, digest in gate['baselineFiles'].items():
        assert sha(previous / name) == digest, name
check_baseline()
for name, digest in gate['files'].items():
    target = (WORK / name).resolve(strict=True)
    assert target.is_relative_to(WORK) and sha(target) == digest, name

def switch(target):
    assert target.is_relative_to(BASE / 'releases') and target.is_dir()
    temporary = BASE / 'current-server-video-tmp'
    assert not temporary.exists() and not temporary.is_symlink()
    temporary.symlink_to(target)
    os.replace(temporary, BASE / 'current')
def start(target):
    run(['docker','compose','--project-directory',str(target),'up','-d','--no-deps','--no-build','--pull','never','backend'])
    for _ in range(90):
        if output(['docker','inspect','--format','{{.State.Health.Status}}','bnbu-sports-production-backend-1']) == 'healthy': return
        time.sleep(1)
    raise RuntimeError('Backend readiness timeout')
def http(url):
    with urllib.request.urlopen(url,timeout=30) as response:
        assert response.status == 200
        return response.read()

if sys.argv[1] == '--prepare':
    assert not RELEASE.exists()
    run(['docker','tag',gate['baseImage'],'bnbu-backend-production:server-video-base-20260915'])
    env = dict(line.split('=',1) for line in (previous / '.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
    run(['docker','tag',env['MIGRATOR_IMAGE'],'bnbu-migrator-production:server-video-base-20260915'])
    with (WORK / 'build.log').open('w') as log:
        subprocess.run(['docker','build','--pull=false','-t',TAG,str(WORK / 'backend')],check=True,stdout=log,stderr=subprocess.STDOUT)
        subprocess.run(['docker','build','--pull=false','-t',MIGRATOR,str(WORK / 'migrator')],check=True,stdout=log,stderr=subprocess.STDOUT)
    image = output(['docker','image','inspect','--format','{{.Id}}',TAG])
    run(['docker','run','--rm','--network','none','--read-only','--entrypoint','ffmpeg',TAG,'-version'])
    shutil.copytree(previous, RELEASE)
    for file in (WORK / 'web').rglob('*'):
        if file.is_file():
            target = RELEASE / 'web' / file.relative_to(WORK / 'web')
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(file,target)
    text = (RELEASE / '.env').read_text()
    text,n = re.subn(r'(?m)^BACKEND_IMAGE=.*$', 'BACKEND_IMAGE='+image,text); assert n == 1
    text,n = re.subn(r'(?m)^MIGRATOR_IMAGE=.*$', 'MIGRATOR_IMAGE='+MIGRATOR,text); assert n == 1
    (RELEASE / '.env').write_text(text)
    prepared = {'image':image,'migrator':output(['docker','image','inspect','--format','{{.Id}}',MIGRATOR])}
    (WORK / 'prepared.json').write_text(json.dumps(prepared))
    print(json.dumps({'result':'PREPARED',**prepared}))
    raise SystemExit

prepared = json.loads((WORK / 'prepared.json').read_text())
assert output(['docker','image','inspect','--format','{{.Id}}',TAG]) == prepared['image']
assert output(['docker','image','inspect','--format','{{.Id}}',MIGRATOR]) == prepared['migrator']
# Verify real COS upload, scan, normalization and private output before changing traffic.
probe = output(['docker','compose','--project-directory',str(RELEASE),'run','--rm','--no-deps',
    '-v',str(WORK / 'verify-live.mjs')+':/app/verify-video-live.mjs:ro','backend','node','/app/verify-video-live.mjs'])
assert json.loads(probe)['result'] == 'PASS'
(WORK / 'cos-verification.json').write_text(probe)
backup = json.loads(output(['python3',str(WORK / 'backup-before-bugfix.py')]))
assert backup['result'] == 'PASS'
(WORK / 'backup.json').write_text(json.dumps(backup))
check_baseline()
run(['docker','compose','--project-directory',str(RELEASE),'--profile','migration','run','--rm','--no-deps',
    'migrator','node','scripts/run-migration-with-secrets.mjs'])
try:
    start(RELEASE)
    http('https://www.student.bnbusports.cn/api/v1/health/ready')
    switch(RELEASE)
    for name,digest in gate['files'].items():
        if name.startswith('web/'):
            assert hashlib.sha256(http('https://www.student.bnbusports.cn/'+name[4:]+'?verify=server-video-20260915')).hexdigest() == digest,name
        if name.startswith('backend/dist/'):
            assert output(['docker','exec','bnbu-sports-production-backend-1','sha256sum','/app/'+name[len('backend/'):]]).split()[0] == digest,name
    for url in ['https://www.student.bnbusports.cn/student/','https://www.teacher.bnbusports.cn/','https://bnbusports.cn/']:
        http(url)
    assert output(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-portal-1']) == gate['portalImage']
    result={'result':'PASS','release':str(RELEASE),'previous':str(previous),'image':prepared['image'],'backup':backup,
        'realCosNormalization':'PASS','health':'PASS','staticAndBackendHashes':'PASS','migration':'0079_server_video_normalization'}
    (WORK / 'deployment.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result))
except Exception:
    if (BASE / 'current').resolve() in [previous,RELEASE]:
        switch(previous)
        start(previous)
    raise
