"""Package the reviewed three-role frontend against the captured live release."""
from pathlib import Path
import hashlib, json, re, shutil, tarfile
ROOT=Path(__file__).resolve().parents[2]
WORK=ROOT/'.local/web-release-20261002'
BUNDLE=WORK/'bundle'
PORTAL=ROOT/'BNBU-Sports-Web-new/portal-teacher-admin'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
read=lambda name:(WORK/name).read_text(encoding='utf-8-sig')
failed=lambda text:set(re.findall(r'^✖ (.+?) \([\d.]+ms\)$',text,re.M))
baseline=failed((ROOT/'.local/performance-20260930/portal-candidate-tests.log').read_text(encoding='utf-8'))
assert len(baseline)==3 and failed(read('portal-all-tests.log'))==baseline
assert 'ℹ pass 184' in read('portal-all-tests.log')
assert 'ℹ pass 201' in read('student-tests.log') and 'ℹ fail 0' in read('student-tests.log')
assert 'checks=88' in read('student-smoke.log')
assert 'ℹ pass 5' in read('local-storage-tests.log') and 'ℹ fail 0' in read('local-storage-tests.log')
assert 'Build complete.' in read('portal-build.log')
assert not re.search(r'error TS\d+',read('portal-typecheck.log'))
live=json.loads(read('live-baseline.json'))
assert live['portalServerSha']==sha(ROOT/'.local/performance-20260930/bundle/dist/server/index.js')
student=json.loads(read('student-candidate/asset-manifest.json'))
changed={n for n,h in student['files'].items() if live['student'].get(n)!=h}
allowed={'js/app-download-promo.js','js/app.js','js/checkin-end-reward.js','js/checkin-experience.js','js/checkin-form-motion.js','js/checkin-gestures.js','js/checkin-layout.js','js/checkin-motion-loader.js','js/checkin-motion.js','js/checkin-proof-queue.js','js/checkin-slide-end.js','js/electric-brand.js','js/icons.js','js/local-preview.js','js/proof-status-mark.js','js/screens/checkin.js','js/screens/profile.js','js/sport-line-motion.js','js/upload-progress.js','css/checkin-layout.css','css/electric-brand.css','assets/bnbu-sports-electric.svg'}
assert all(n in allowed or n.startswith(('vendor/animejs-4.5.0/','vendor/canvas-confetti-1.9.4/','vendor/electric-logo/')) or n=='vendor/checkin-motion-dependencies.md' for n in changed),changed-allowed
assert not live['student'].keys()-student['files'].keys()
BUNDLE.mkdir(exist_ok=True)
for name in ['server','client/assets','client/.vite']:
    shutil.copytree(PORTAL/'dist'/name,BUNDLE/'dist'/name,dirs_exist_ok=True)
shutil.copytree(WORK/'student-candidate',BUNDLE/'student',dirs_exist_ok=True)
(BUNDLE/'Dockerfile').write_text('FROM bnbu-portal-checkin-ui-base:20261002\nCOPY --chown=10001:10001 dist/ /app/dist/\n')
shutil.copyfile(ROOT/'tools/production/deploy-checkin-ui-20261002.py',BUNDLE/'deploy.py')
shutil.copyfile(WORK/'student-source/assets/bnbu-sports-electric.svg',BUNDLE/'bnbu-sports-electric.svg')
gate={'result':'PASS','newTestFailures':[],'baselinePortalFailures':sorted(baseline),'live':live,
      'student':student,'liveStudentHashes':live['legacyStudent'],'legacyStudent':live['legacyStudent'],
      'changedStudent':sorted(changed),'portalAssets':{p.name:sha(p) for p in (BUNDLE/'dist/client/assets').iterdir() if p.is_file()},
      'files':{p.relative_to(BUNDLE).as_posix():sha(p) for p in BUNDLE.rglob('*') if p.is_file() and p.name!='validation.json'},
      'checks':{'student':'201/201','studentSmoke':'88/88','localStorage':'5/5','portal':'184/187; same 3 baseline assertions','types':'PASS','build':'PASS'}}
(BUNDLE/'validation.json').write_text(json.dumps(gate,indent=2))
with tarfile.open(WORK/'bundle.tar.gz','w:gz') as archive:
    for p in BUNDLE.iterdir():archive.add(p,arcname=p.name)
print(json.dumps({'result':'PACKAGED','sha256':sha(WORK/'bundle.tar.gz'),'bytes':(WORK/'bundle.tar.gz').stat().st_size,'studentVersion':student['version'],'changedStudent':len(changed),'portalAssets':len(gate['portalAssets'])}))
