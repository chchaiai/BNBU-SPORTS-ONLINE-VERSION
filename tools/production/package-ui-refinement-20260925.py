"""Package the reviewed UI delta without replacing divergent production features."""
from pathlib import Path
import difflib
import hashlib
import json
import re
import shutil
import subprocess
import tarfile

root = Path(__file__).resolve().parents[2]
work = root / '.local/ui-refinement-20260925'
bundle = work / 'bundle'
assert not bundle.exists()
bundle.mkdir()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
gate = json.loads((work / 'baseline/baseline.json').read_text())
assert json.loads((work / 'baseline-comparison.json').read_text())['result'] == 'PASS'
baseline_log = (work / 'baseline-tests.log').read_text(encoding='utf8')
candidate_log = (work / 'candidate-tests.log').read_text(encoding='utf8')
failed = lambda text: set(re.findall(r'^✖ (.+?) \([\d.]+ms\)$', text, re.M))
new_portal_failures = sorted(failed(candidate_log) - failed(baseline_log))
assert not new_portal_failures
assert 'ℹ tests 144' in candidate_log and 'ℹ pass 141' in candidate_log and 'Build complete.' in candidate_log
student_log = (work / 'student-smoke.log').read_text(encoding='utf8')
student_baseline = (work / 'student-baseline.log').read_text(encoding='utf8')
student_failures = lambda text: set(re.findall(r'^FAIL - (.+?): ', text, re.M))
new_student_failures = sorted(student_failures(student_log) - student_failures(student_baseline))
assert not new_student_failures
assert student_log.count('\nok - ') >= 80
types = (work / 'typecheck.log').read_text(encoding='utf8')
assert 'Phase 5B Contract binding OK' in types and 'error TS' not in types

source = work / 'source'
portal = source / 'BNBU-Sports-Web-new/portal-teacher-admin/dist'
# Keep all previously published static images and historical chunks in the base image.
for name in ['server', 'client/assets', 'client/.vite']:
    shutil.copytree(portal / name, bundle / 'portal/dist' / name)
(bundle / 'portal/Dockerfile').write_text(
    'FROM bnbu-portal-ui-refinement-base:20260925\n'
    'LABEL org.opencontainers.image.version="ui-refinement-20260925"\n'
    'COPY --chown=10001:10001 dist/ /app/dist/\n', newline='\n')

paths = subprocess.check_output(['git', 'diff', '--name-only', '0f52b5ed..f603ad8d'], cwd=root, text=True).splitlines()
prefix = 'BNBU-Sports-Web-new/frontend/student/'
student_delta = []
student_merges = []
for path in paths:
    if not path.startswith(prefix):
        continue
    relative = path.removeprefix(prefix)
    live = work / 'baseline/student' / relative
    after = (source / path).read_bytes().replace(b'\r\n', b'\n')
    before_result = subprocess.run(['git', 'show', '0f52b5ed:' + path], cwd=root, capture_output=True)
    if before_result.returncode:
        assert not live.exists() and relative == 'css/ui-refinement.css'
        output = after
    else:
        before = before_result.stdout.replace(b'\r\n', b'\n')
        current = live.read_bytes().replace(b'\r\n', b'\n')
        if current == before:
            output = after
        else:
            assert relative == 'js/screens/notifications.js'
            old_lines, new_lines = before.splitlines(keepends=True), after.splitlines(keepends=True)
            edits = [(i, j, k, l) for tag, i, j, k, l in difflib.SequenceMatcher(None, old_lines, new_lines).get_opcodes() if tag != 'equal']
            assert len(edits) == 1
            i, j, k, l = edits[0]
            old, new = b''.join(old_lines[i:j]), b''.join(new_lines[k:l])
            assert b'remainingSeconds' in old and current.count(old) == 1
            output = current.replace(old, new)
            student_merges.append({'path': relative, 'preservedProductionLogic': True, 'changedLines': j - i})
    target = bundle / 'student' / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(output)
    student_delta.append(relative)

assert len(student_delta) == 6
gate['sourceCommits'] = ['9d2721bb', 'f603ad8d']
gate['studentDelta'] = student_delta
gate['studentMerges'] = student_merges
gate['checks'] = {
    'types': 'PASS', 'build': 'PASS', 'baselineComparison': 'PASS',
    'portalTests': {'passed': 141, 'total': 144, 'baselineFailures': sorted(failed(baseline_log)), 'remainingFailures': sorted(failed(candidate_log))},
    'studentSmoke': {'passed': student_log.count('\nok - '), 'remainingFailures': sorted(student_failures(student_log))},
    'newPortalFailures': new_portal_failures, 'newStudentFailures': new_student_failures,
}
gate['files'] = {p.relative_to(bundle).as_posix(): sha(p) for p in bundle.rglob('*') if p.is_file()}
(bundle / 'validation.json').write_text(json.dumps(gate, indent=2), newline='\n')
with tarfile.open(work / 'bundle.tar.gz', 'w:gz') as archive:
    for p in bundle.iterdir():
        archive.add(p, arcname=p.name)
print(json.dumps({'result': 'PACKAGED', 'files': len(gate['files']), 'studentFiles': student_delta,
                  'productionMerges': student_merges, 'sha256': sha(work / 'bundle.tar.gz')}))
