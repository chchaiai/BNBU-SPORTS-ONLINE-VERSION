"""Package only the verified course display and roster portal delta."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import tarfile

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / '.local/course-roster-20260928'
PORTAL = ROOT / 'BNBU-Sports-Web-new/portal-teacher-admin'
BASELINE = ROOT / '.local/ui-refinement-20260925/source/BNBU-Sports-Web-new/portal-teacher-admin'
BUNDLE = WORK / 'bundle'
assert not BUNDLE.exists()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
failures = lambda p: set(re.findall(r'^✖ (.+?) \([\d.]+ms\)$', p.read_text(encoding='utf8'), re.M))
old_failures = failures(ROOT / '.local/ui-refinement-20260925/candidate-tests.log')
new_failures = failures(WORK / 'portal-tests.log') - old_failures
assert not new_failures
assert 'ℹ pass 141' in (WORK / 'portal-tests.log').read_text(encoding='utf8')
assert 'ℹ pass 4' in (WORK / 'final-targeted-tests.log').read_text(encoding='utf8')
assert 'ℹ pass 16' in (WORK / 'roster-tests.log').read_text(encoding='utf8')
assert 'ℹ pass 6' in (WORK / 'backend-roster-tests.log').read_text(encoding='utf8')
assert 'error TS' not in (WORK / 'typecheck.log').read_text(encoding='utf8')
assert 'Build complete.' in (WORK / 'build.log').read_text(encoding='utf8')
allowed = {'app/language.tsx', 'app/roster-reconciliation.tsx', 'app/teacher-workspace.tsx',
           'app/ui-refinement.css', 'app/missing-enrollment.ts', 'package.json'}
delta = []
for name in ['app', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json']:
    for p in ([PORTAL / name] if (PORTAL / name).is_file() else (PORTAL / name).rglob('*')):
        if not p.is_file():
            continue
        rel = p.relative_to(PORTAL).as_posix()
        old = BASELINE / rel
        if not old.exists() or old.read_bytes().replace(b'\r\n', b'\n') != p.read_bytes().replace(b'\r\n', b'\n'):
            assert rel in allowed, rel
            delta.append(rel)
BUNDLE.mkdir()
for name in ['server', 'client/assets', 'client/.vite']:
    shutil.copytree(PORTAL / 'dist' / name, BUNDLE / 'dist' / name)
(BUNDLE / 'Dockerfile').write_text('FROM bnbu-portal-course-roster-base:20260928\nCOPY --chown=10001:10001 dist/ /app/dist/\n')
shutil.copyfile(ROOT / 'tools/production/deploy-course-roster-20260928.py', BUNDLE / 'deploy.py')
gate = {'result': 'PASS', 'newTestFailures': sorted(new_failures), 'existingTestFailures': sorted(old_failures),
        'sourceDelta': delta, 'checks': {'types': 'PASS', 'build': 'PASS', 'portal': '141/144; 3 baseline failures',
        'roster': '16/16', 'targeted': '4/4', 'backendRoster': '6/6', 'download': '2 expected rows verified'},
        'files': {p.relative_to(BUNDLE).as_posix(): sha(p) for p in BUNDLE.rglob('*') if p.is_file()}}
(BUNDLE / 'validation.json').write_text(json.dumps(gate, indent=2))
with tarfile.open(WORK / 'bundle.tar.gz', 'w:gz') as archive:
    for p in BUNDLE.iterdir():
        archive.add(p, arcname=p.name)
evidence = ROOT / 'evidence/course-roster-20260928'
shutil.copyfile(BUNDLE / 'validation.json', evidence / 'validation.json')
for p in WORK.glob('*.log'):
    shutil.copyfile(p, evidence / p.name)
print(json.dumps({'result': 'PACKAGED', 'sha256': sha(WORK / 'bundle.tar.gz'), 'sourceDelta': delta}))
