"""Package an allowlisted frontend overlay after baseline-comparison checks."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import tarfile

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / '.local/performance-20260930'
BUNDLE = WORK / 'bundle'
PORTAL = ROOT / 'BNBU-Sports-Web-new/portal-teacher-admin'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
failures = lambda p: set(re.findall(r'^✖ (.+?) \([\d.]+ms\)$', p.read_text(encoding='utf-8'), re.M))
baseline_failures = failures(WORK / 'portal-baseline-tests.log')
assert len(baseline_failures) == 3
assert failures(WORK / 'portal-candidate-tests.log') == baseline_failures
assert 'ℹ pass 153' in (WORK / 'portal-candidate-tests.log').read_text(encoding='utf-8')
assert 'Build complete.' in (WORK / 'portal-candidate-tests.log').read_text(encoding='utf-8')
assert not (WORK / 'portal-types.log').read_text().strip()
assert 'ℹ pass 7' in (WORK / 'teacher-targeted.log').read_text(encoding='utf-8')
assert 'ℹ fail 0' in (WORK / 'teacher-targeted.log').read_text(encoding='utf-8')
assert 'ℹ pass 113' in (WORK / 'student-candidate-tests.log').read_text(encoding='utf-8')
assert 'ℹ fail 0' in (WORK / 'student-candidate-tests.log').read_text(encoding='utf-8')
smoke = lambda p: set(re.findall(r'^FAIL - (.*)', p.read_text(encoding='utf-8'), re.M))
assert smoke(WORK / 'student-smoke.log') == smoke(WORK / 'student-baseline-smoke.log')
live = json.loads((WORK / 'live-baseline.json').read_text())
assert live['portalServerSha'] == sha(ROOT / '.local/student-bulk-actions-20260929/bundle/dist/server/index.js')
student = json.loads((WORK / 'student-release/asset-manifest.json').read_text())
changed_student = {n for n, digest in student['files'].items() if live['files'].get(n) != digest}
assert changed_student == {'js/app.js', 'js/lazy-student-screens.js', 'js/performance.js'}, changed_student
BUNDLE.mkdir(exist_ok=True)
for name in ['server', 'client/assets', 'client/.vite']:
    shutil.copytree(PORTAL / 'dist' / name, BUNDLE / 'dist' / name, dirs_exist_ok=True)
shutil.copytree(WORK / 'student-release', BUNDLE / 'student', dirs_exist_ok=True)
(BUNDLE / 'Dockerfile').write_text('FROM bnbu-portal-access-performance-base:20260930\nCOPY --chown=10001:10001 dist/ /app/dist/\n')
shutil.copyfile(ROOT / 'tools/production/deploy-access-performance-20260930.py', BUNDLE / 'deploy.py')
shutil.copyfile(ROOT / 'tools/performance/browser-metrics.js', BUNDLE / 'browser-metrics.js')
assert sha(ROOT / 'tools/performance/browser-metrics.js') == sha(ROOT / 'BNBU-Sports-Web-new/frontend/student/js/performance.js')
fields = ['dns', 'connect', 'tls', 'wait', 'download', 'ttfb', 'fcp', 'ready', 'load', 'count']
pattern = '^v=1&id=[0-9a-f]{16}' + ''.join('&' + key + '=[0-9]{1,6}' for key in fields) + r'&bytes=[0-9]{1,9}&protocol=(h2|h3|http%2F1\.1|other)&restored=[01]$'
payload = {'time': '$time_iso8601', 'host': '$host', 'id': '$arg_id', **{key: '$arg_' + key for key in fields}, 'bytes': '$arg_bytes', 'protocol': '$arg_protocol', 'restored': '$arg_restored'}
(BUNDLE / 'performance-global.conf').write_text(
    'map $args $bnbu_performance_valid {\n    default 0;\n    "~' + pattern + '" 1;\n}\n'
    + "log_format bnbu_performance escape=json '" + json.dumps(payload, separators=(',', ':')) + "';\n"
    + 'limit_req_zone $binary_remote_addr zone=bnbu_performance:1m rate=10r/s;\n')
(BUNDLE / 'performance-locations.conf').write_text('''    location = /__performance.js {
        alias /opt/bnbu-sports-production/shared/performance/browser-metrics.js;
        default_type application/javascript;
        add_header Cache-Control "public, no-cache";
        add_header X-Content-Type-Options nosniff always;
        access_log off;
    }
    location = /__performance {
        if ($request_method != GET) { return 405; }
        if ($bnbu_performance_valid = 0) { return 400; }
        limit_req zone=bnbu_performance burst=100 nodelay;
        limit_req_status 429;
        add_header Cache-Control no-store always;
        access_log /var/log/nginx/performance-timing.log bnbu_performance if=$bnbu_performance_valid;
        root /var/empty;
        try_files /bnbu-performance-no-file =204;
    }
''')
gate = {
    'result': 'PASS', 'newTestFailures': [], 'baselinePortalFailures': sorted(baseline_failures),
    'baselineStudentSmokeFailures': sorted(smoke(WORK / 'student-smoke.log')),
    'student': student, 'liveStudentHashes': live['studentLegacy'], 'legacyStudent': live['studentLegacy'],
    'portalAssets': {p.name: sha(p) for p in (BUNDLE / 'dist/client/assets').iterdir() if p.is_file()},
    'files': {p.relative_to(BUNDLE).as_posix(): sha(p) for p in BUNDLE.rglob('*') if p.is_file() and p.name != 'validation.json'},
    'checks': {'portal': '153/156; same 3 baseline failures', 'student': '113/113', 'teacherTargeted': '7/7',
               'browser': 'Synthetic real-loading fixture: initial 18 requests, record details on selection, failure and retry, Grades deferred; student four lazy tabs rendered'},
}
(BUNDLE / 'validation.json').write_text(json.dumps(gate, indent=2))
with tarfile.open(WORK / 'bundle.tar.gz', 'w:gz') as archive:
    for p in BUNDLE.iterdir():
        archive.add(p, arcname=p.name)
print(json.dumps({'result': 'PACKAGED', 'sha256': sha(WORK / 'bundle.tar.gz'), 'bytes': (WORK / 'bundle.tar.gz').stat().st_size,
                  'studentChanged': sorted(changed_student), 'studentInitialModules': len(student['initialModules']),
                  'studentInitialBytes': student['initialJavaScriptBytes']}))
