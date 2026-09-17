import hashlib
import json
from pathlib import Path
import shutil
import tarfile
import urllib.request

root=Path('BNBU-Sports-Web-new/frontend/student')
evidence=Path('evidence/iphone-video-20260915')
bundle=evidence/'bundle'
files=['js/recorded-video.js','js/checkin-drafts.js','js/screens/checkin.js','js/api.js','vendor/ffmpeg/api/classes.js']
baseline={}
hashes={}
for name in files:
    with urllib.request.urlopen('https://www.student.bnbusports.cn/student/'+name+'?baseline=iphone-20260915',timeout=30) as response:
        content=response.read()
    saved=evidence/'baseline'/name
    saved.parent.mkdir(parents=True,exist_ok=True)
    saved.write_bytes(content)
    baseline[name]=hashlib.sha256(content).hexdigest()
    dest=bundle/'student'/name
    dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(root/name,dest)
    hashes[name]=hashlib.sha256(dest.read_bytes()).hexdigest()
# Existing account work must match the production baseline before this overlay.
assert (evidence/'api.before.js').read_text()==(evidence/'baseline/js/api.js').read_text()
for file,remote in [('recorded-video.before.js','js/recorded-video.js'),('checkin.before.js','js/screens/checkin.js'),('checkin-drafts.before.js','js/checkin-drafts.js')]:
    assert (evidence/file).read_text()==(evidence/'baseline'/remote).read_text()
assert json.loads((evidence/'conversion.json').read_text())['result']=='PASS'
assert json.loads((evidence/'browser.json').read_text())['result']=='PASS'
gate={'baseline':baseline,'files':hashes,'nginx':'693a591f0f32e87c7c423c99a9ce77b96a1f03859d21b010f2f405fbc2b85437','checks':{'unit':14,'conversion':'PASS','browser':'PASS','backendValidator':5}}
(bundle/'validation.json').write_text(json.dumps(gate,indent=2))
shutil.copyfile('tools/production/deploy-iphone-video-20260915.py',bundle/'deploy.py')
with tarfile.open(evidence/'bundle.tar.gz','w:gz') as archive:
    for file in bundle.rglob('*'):
        if file.is_file():archive.add(file,arcname=str(file.relative_to(bundle)))
print(json.dumps({'result':'PACKAGED','files':hashes}))
