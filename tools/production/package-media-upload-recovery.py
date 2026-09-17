import hashlib
import json
from pathlib import Path
import shutil
import tarfile

evidence = Path('evidence/media-upload-recovery-20260915')
bundle = evidence / 'bundle-r2'
assert not bundle.exists()
gate = json.loads((evidence / 'baseline.json').read_text(encoding='utf-8-sig'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(evidence / 'api.before.js') == gate['baselineFiles']['web/student/js/api.js']
for name, expected in [('frontend-tests.log', 17), ('postgres-http.log', 6), ('backend-unit.log', 27)]:
    log = (evidence / name).read_text(encoding='utf-8-sig')
    assert f'pass {expected}' in log and 'fail 0' in log, name
assert 'error TS' not in (evidence / 'typecheck.log').read_text(encoding='utf-8-sig')
assert not (evidence / 'lint.log').read_text(encoding='utf-8-sig').strip()
gate['checks'] = {'frontend': 17, 'postgresHttp': 6, 'backendUnit': 27, 'typecheck': 'PASS', 'lint': 'PASS', 'build': 'PASS'}
gate['files'] = {}
for source, target in [
    ('BNBU-Sports-Web-new/frontend/student/js/api.js', 'web/student/js/api.js'),
    ('backend/dist/modules/media/application/media.service.js', 'backend/dist/modules/media/application/media.service.js'),
    ('backend/dist/modules/media/application/media.service.js.map', 'backend/dist/modules/media/application/media.service.js.map'),
    ('tools/production/deploy-media-upload-recovery.py', 'deploy.py')]:
    dest = bundle / target
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, dest)
    gate['files'][target] = sha(dest)
dockerfile = bundle / 'backend/Dockerfile'
dockerfile.write_text('FROM bnbu-backend-production:media-upload-recovery-base-20260915\nCOPY --chown=10001:10001 dist/ /app/dist/\n')
gate['files']['backend/Dockerfile'] = sha(dockerfile)
(bundle / 'validation.json').write_text(json.dumps(gate, indent=2))
with tarfile.open(evidence / 'bundle-r2.tar.gz', 'w:gz') as archive:
    for file in bundle.rglob('*'):
        if file.is_file():
            archive.add(file, arcname=str(file.relative_to(bundle)))
print(json.dumps({'result': 'PACKAGED', 'sha256': sha(evidence / 'bundle-r2.tar.gz'), 'files': gate['files']}))
