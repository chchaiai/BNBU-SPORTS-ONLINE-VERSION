"""Package the narrow frontend change against the captured live release."""
from pathlib import Path
import hashlib
import json
import shutil
import tarfile

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / '.local/access-speed-20260928'
PORTAL = ROOT / 'BNBU-Sports-Web-new/portal-teacher-admin'
BUNDLE = WORK / 'bundle'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
inventory = lambda root: {p.relative_to(root).as_posix(): sha(p) for p in root.rglob('*') if p.is_file()}
report = json.loads((ROOT / 'evidence/access-speed-20260928/build-verification.json').read_text())
assert report['result'] == 'PASS' and report['newPortalFailures'] == [] and report['newStudentSmokeFailures'] == []
browser = json.loads((ROOT / 'evidence/access-speed-20260928/browser-verification.json').read_text())
assert len(browser) == 5 and browser[-1]['productionBuild'] == 'PASS'
assert 'ℹ pass 111' in (WORK / 'student-candidate-tests.log').read_text(encoding='utf8')
assert 'ℹ pass 41' in (WORK / 'minified-tests.log').read_text(encoding='utf8')
assert 'Build complete.' in (WORK / 'portal-build.log').read_text(encoding='utf8')
assert not (WORK / 'types-final.log').read_text(encoding='utf8').strip()
assert 'error TS' not in (WORK / 'full-typecheck.log').read_text(encoding='utf8')
assert sha(WORK / 'portal-baseline/dist/server/index.js') == 'a4d5a6d07b4a8c38a586eed483527d623e1f99372a8a2118d0e95a47033bfd69'
allowed = {'app/portal-app.tsx', 'app/admin-workspace.tsx', 'app/deferred-component.tsx'}
delta = []
for name in ['app', 'package.json', 'package-lock.json', 'vite.config.ts']:
    for p in ([PORTAL / name] if (PORTAL / name).is_file() else (PORTAL / name).rglob('*')):
        if not p.is_file():
            continue
        rel = p.relative_to(PORTAL).as_posix()
        old = WORK / 'portal-baseline' / rel
        if not old.exists() or old.read_bytes().replace(b'\r\n', b'\n') != p.read_bytes().replace(b'\r\n', b'\n'):
            assert rel in allowed, rel
            delta.append(rel)
assert set(delta) == allowed
assert not BUNDLE.exists()
BUNDLE.mkdir()
for name in ['server', 'client/assets', 'client/.vite']:
    shutil.copytree(PORTAL / 'dist' / name, BUNDLE / 'dist' / name)
student = json.loads((WORK / 'student-built/asset-manifest.json').read_text())
version = student['version']
shutil.copytree(WORK / 'student-built/_assets' / version, BUNDLE / 'student/_assets' / version)
shutil.copyfile(WORK / 'student-built/index.html', BUNDLE / 'student/index.html')
(BUNDLE / 'Dockerfile').write_text('FROM bnbu-portal-access-speed-base:20260928\nCOPY --chown=10001:10001 dist/ /app/dist/\n')
shutil.copyfile(ROOT / 'tools/production/deploy-access-speed-20260928.py', BUNDLE / 'deploy.py')
live_student = inventory(WORK / 'baseline/student')
gate = {'result': 'PASS', 'newTestFailures': [], 'sourceDelta': delta,
        'student': student, 'portalAssets': inventory(BUNDLE / 'dist/client/assets'),
        'legacyStudent': {name: live_student[name] for name in ['js/app.js', 'js/api.js', 'js/screens/checkin.js', 'js/screens/notifications.js']},
        'liveStudentHashes': live_student, 'files': inventory(BUNDLE),
        'checks': {'student': '111/111', 'minifiedBusiness': '41/41', 'portal': '171/174; same 3 baseline failures',
                   'studentSmoke': 'same 1 baseline failure', 'types': 'PASS', 'build': 'PASS', 'browser': browser}}
(BUNDLE / 'validation.json').write_text(json.dumps(gate, indent=2))
with tarfile.open(WORK / 'bundle.tar.gz', 'w:gz') as archive:
    for p in BUNDLE.iterdir():
        archive.add(p, arcname=p.name)
shutil.copyfile(BUNDLE / 'validation.json', ROOT / 'evidence/access-speed-20260928/validation.json')
print(json.dumps({'result': 'PACKAGED', 'sha256': sha(WORK / 'bundle.tar.gz'), 'bytes': (WORK / 'bundle.tar.gz').stat().st_size}))
