from pathlib import Path
import json,hashlib,shutil,tarfile
root=Path.cwd();e=root/'evidence/checkin-media-20260919';bundle=e/'bundle';bundle.mkdir(exist_ok=True)
assert json.loads((e/'browser.json').read_text())['result']=='PASS'
assert 'pass 1' in (e/'browser-http.log').read_text(encoding='utf-8-sig') and 'fail 0' in (e/'browser-http.log').read_text(encoding='utf-8-sig')
assert 'pass 8' in (e/'candidate-tests.log').read_text(encoding='utf-8-sig') and 'fail 0' in (e/'candidate-tests.log').read_text(encoding='utf-8-sig')
gate=json.loads((e/'baseline.json').read_text(encoding='utf-8-sig'))
for src,target in [(root/'.local/checkin-media-candidate/student/js/api.js','web/student/js/api.js'),(root/'.local/checkin-media-candidate/student/js/screens/checkin.js','web/student/js/screens/checkin.js'),(e/'exercise-records.service.js','backend/dist/modules/exercise-records/application/exercise-records.service.js'),(root/'tools/production/deploy-checkin-media-20260919.py','deploy.py')]:
 p=bundle/target;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,p)
(bundle/'backend/Dockerfile').write_text('FROM bnbu-backend-production:checkin-media-base-20260919\nCOPY --chown=10001:10001 dist/ /app/dist/\n',encoding='utf-8')
gate['checks']={'frontend':89,'smoke':87,'candidateUnit':8,'candidateBrowser':'PASS','httpRecovery':'PASS','baselineRegressionFailures':6,'typecheck':'PASS'}
gate['files']={p.relative_to(bundle).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in bundle.rglob('*') if p.is_file()}
(bundle/'validation.json').write_text(json.dumps(gate,indent=2),encoding='utf-8')
with tarfile.open(e/'bundle.tar.gz','w:gz') as tar:
 for p in bundle.iterdir():tar.add(p,arcname=p.name)
print(json.dumps({'files':gate['files'],'bundleBytes':(e/'bundle.tar.gz').stat().st_size}))
