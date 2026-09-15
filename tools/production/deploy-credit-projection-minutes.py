"""Deploy only the reviewed 0077 constraint migration on the pinned Hong Kong release."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import urllib.request

BASE = Path('/opt/bnbu-sports-production')
WORK = Path('/home/ubuntu/bnbu-credit-projection-0077-20260914')
MIGRATION = '0077_credit_projection_minutes'
TAG = 'bnbu-migrator-production:credit-projection-0077-20260914'
assert os.geteuid() == 0 and sys.argv[1:] in [['--prepare'], ['--apply'], ['--verify']]
gate = json.loads((WORK / 'validation.json').read_text())
assert gate['checks'] == {'http': 7, 'migrationSafety': 13, 'typecheck': 'PASS', 'build': 'PASS', 'oldConstraintReproduction': 2}
previous = Path(gate['baseline']['current'])
release = BASE / 'releases/credit-projection-0077-20260914'
assert previous.is_relative_to(BASE / 'releases') and previous != release

def output(args, **kwargs):
    return subprocess.check_output(args, text=True, **kwargs).strip()

def run(args):
    subprocess.run(args, check=True)

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def inspect():
    return json.loads(output(['python3', str(WORK / 'inspect-credit-projection.py')]))

def baseline():
    state = inspect()
    assert state['current'] == str(previous)
    for name in ['imageIds', 'runtime', 'backendFiles']:
        assert state[name] == gate['baseline'][name], 'Production baseline changed: ' + name
    active = [m for m in state['migrations'] if m['rolled_back_at'] is None]
    assert len(active) == 76
    assert {m['migration_name']:m['checksum'] for m in active} == gate['previousMigrations']
    assert all(m['finished_at'] for m in active)
    constraints = {c['name']:c for c in state['constraints']}
    assert constraints['v81_credit_projections_eligible_minutes_check']['definition'] == 'CHECK (((eligible_minutes >= 0) AND (eligible_minutes <= 60)))'
    assert constraints['v81_credit_projections_check']['definition'] == 'CHECK (((credited_minutes >= 0) AND (credited_minutes <= eligible_minutes)))'
    assert all(c['validated'] for c in state['constraints'])
    return state

for name, digest in gate['files'].items():
    path = (WORK / name).resolve(strict=True)
    assert path.is_relative_to(WORK) and path.is_file() and sha(path) == digest
before = baseline() if sys.argv[1] != '--verify' else gate['baseline']
assert release.exists() if sys.argv[1] == '--verify' else not release.exists()

if sys.argv[1] == '--prepare':
    run(['docker','build','--pull=false','-t',TAG,str(WORK / 'migrator')])
    image_id = output(['docker','image','inspect','--format','{{.Id}}',TAG])
    actual = output(['docker','run','--rm','--network','none','--entrypoint','node',TAG,'-e',
        "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('prisma/migrations/0077_credit_projection_minutes/migration.sql')).digest('hex'))"])
    assert actual == gate['migrationSha256']
    prepared = {'result':'PASS','imageId':image_id,'migrationSha256':actual}
    (WORK / 'prepared.json').write_text(json.dumps(prepared,indent=2)+'\n')
    print(json.dumps(prepared))
    raise SystemExit(0)

prepared = json.loads((WORK / 'prepared.json').read_text())
assert prepared['result'] == 'PASS' and prepared['migrationSha256'] == gate['migrationSha256']
assert output(['docker','image','inspect','--format','{{.Id}}',TAG]) == prepared['imageId']
if sys.argv[1] == '--apply':
    backup = json.loads(output(['python3',str(WORK / 'backup-before-bugfix.py')]))
    assert backup['result'] == 'PASS'
    (WORK / 'applied-context.json').write_text(json.dumps({'backup':backup,'before':before},indent=2)+'\n')
    shutil.copytree(previous, release)
    content, count = re.subn(r'(?m)^MIGRATOR_IMAGE=.*$', 'MIGRATOR_IMAGE=' + TAG, (release / '.env').read_text())
    assert count == 1
    (release / '.env').write_text(content)
    for name in ['production.env','compose.yml','nginx.conf']:
        assert (release / name).read_bytes() == (previous / name).read_bytes()
    # The runtime already implements per-record caps. No service restart or access hardening is needed.
    run(['docker','compose','--project-directory',str(release),'--profile','migration','run',
        '--rm','--no-deps','migrator','node','scripts/run-migration-with-secrets.mjs'])
else:
    context = json.loads((WORK / 'applied-context.json').read_text())
    backup, before = context['backup'], context['before']
    assert backup['result'] == 'PASS'
after = inspect()
assert after['runtime'] == before['runtime']
expected = dict(gate['previousMigrations'], **{MIGRATION: gate['migrationSha256']})
active = [m for m in after['migrations'] if m['rolled_back_at'] is None]
assert len(active) == 77 and all(m['finished_at'] for m in active)
assert {m['migration_name']:m['checksum'] for m in active} == expected
old_constraints = {c['name']:c for c in before['constraints']}
new_constraints = {c['name']:c for c in after['constraints']}
assert old_constraints.keys() == new_constraints.keys()
for name in old_constraints:
    if name == 'v81_credit_projections_eligible_minutes_check':
        assert new_constraints[name]['definition'] == 'CHECK (((eligible_minutes >= 0) AND (eligible_minutes <= 1440)))'
        assert new_constraints[name]['validated']
    else:
        assert new_constraints[name] == old_constraints[name]
probe = json.loads(output(['docker','exec','-i','bnbu-sports-production-backend-1','node','--input-type=module'],
    input=(WORK / 'verify-credit-projection.mjs').read_text()))
assert probe['result'] == 'PASS' and probe['realReviewsChanged'] is False
link = BASE / 'current-credit-0077-tmp'
assert (BASE / 'current').resolve() in [previous, release]
if (BASE / 'current').resolve() == previous:
    assert not link.exists() and not link.is_symlink()
    link.symlink_to(release)
    os.replace(link, BASE / 'current')
health = {}
for url in ['https://www.student.bnbusports.cn/api/v1/health/ready','https://www.teacher.bnbusports.cn/','https://www.student.bnbusports.cn/student/']:
    with urllib.request.urlopen(url,timeout=15) as response:
        assert response.status == 200
        health[url] = response.status
result = {'result':'PASS','release':str(release),'previous':str(previous),'migration':MIGRATION,
    'migrationSha256':gate['migrationSha256'],'sourceBaseCommit':gate['sourceBaseCommit'],
    'backup':backup,'probe':probe,'health':health,'runtimeRestarted':False,
    'affectedRecordsBefore':before['affectedRecords'],'affectedRecordsAfter':after['affectedRecords'],
    'rollback':'Application remains compatible. Retain the expanded constraint; do not shrink it after longer credits are accepted.'}
(WORK / 'deployment-result.json').write_text(json.dumps(result,indent=2)+'\n')
(release / 'credit-projection-deployment.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
