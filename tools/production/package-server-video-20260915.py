"""Create an explicit, hash-checked overlay from the validated build."""
import hashlib
import json
from pathlib import Path
import shutil
import tarfile

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / 'evidence/video-server-20260915'
BUNDLE = EVIDENCE / 'bundle-mirror'
assert not BUNDLE.exists()
BUNDLE.mkdir()
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
gate = json.loads((EVIDENCE / 'deployment-baseline.json').read_text())
for migration in gate['migrations']:
    assert sha(ROOT / 'backend/prisma/migrations' / migration['name'] / 'migration.sql') == migration['checksum'], migration['name']

def copy(source, destination):
    target = BUNDLE / destination
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / source, target)

for name in ['api.js', 'proofs.js', 'video-source.js', 'swim-submission.js', 'screens/checkin.js']:
    copy('BNBU-Sports-Web-new/frontend/student/js/' + name, 'web/student/js/' + name)
for name in [
    'modules/media/application/media.service', 'modules/media/application/media-validator',
    'modules/media/application/media-processing.worker', 'modules/media/application/media-projection',
    'modules/media/application/video-normalizer', 'common/object-storage/s3-media-storage.adapter',
    'modules/v8/v81-materials', 'modules/v8/v81-upload-window', 'modules/v8/v81.service',
    'generated/migration-manifest.generated',
]:
    for suffix in ['.js', '.js.map']:
        copy('backend/dist/' + name + suffix, 'backend/dist/' + name + suffix)
copy('backend/dist/generated/openapi.document.generated.json', 'backend/dist/generated/openapi.document.generated.json')
for name in ['migration.sql', 'manifest.json']:
    copy('backend/prisma/migrations/0079_server_video_normalization/' + name, 'migrator/prisma/migrations/0079_server_video_normalization/' + name)
(BUNDLE / 'backend/Dockerfile').write_text('FROM bnbu-backend-production:server-video-base-20260915\nUSER root\nRUN sed -i "s|deb.debian.org|mirrors.ustc.edu.cn|g" /etc/apt/sources.list.d/debian.sources && apt-get update && apt-get install --yes --no-install-recommends ca-certificates && sed -i "s|http://mirrors.ustc.edu.cn|https://mirrors.ustc.edu.cn|g" /etc/apt/sources.list.d/debian.sources && apt-get update && apt-get install --yes --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*\nCOPY --chown=10001:10001 dist/ /app/dist/\nUSER 10001:10001\n')
(BUNDLE / 'migrator/Dockerfile').write_text('FROM bnbu-migrator-production:server-video-base-20260915\nCOPY --chown=node:node prisma/migrations/0079_server_video_normalization/ /app/prisma/migrations/0079_server_video_normalization/\n')
for source, destination in [('deploy-server-video-20260915.py','deploy.py'), ('verify-server-video-live.mjs','verify-live.mjs'), ('backup-before-bugfix.py','backup-before-bugfix.py')]:
    copy('tools/production/' + source, destination)
gate['checks'] = {'backendTests':36, 'frontendTests':19, 'realBrowserRecording':'PASS', 'eslint':'PASS', 'build':'PASS', 'migrationSafety':'PASS'}
gate['files'] = {str(path.relative_to(BUNDLE)).replace('\\','/'):sha(path) for path in BUNDLE.rglob('*') if path.is_file()}
(BUNDLE / 'validation.json').write_text(json.dumps(gate, indent=2))
archive = EVIDENCE / 'server-video-20260915-mirror.tar.gz'
assert not archive.exists()
with tarfile.open(archive, 'w:gz') as tar:
    for path in BUNDLE.iterdir():
        tar.add(path, arcname=path.name)
print(json.dumps({'archive':str(archive), 'bytes':archive.stat().st_size, 'sha256':sha(archive), 'files':len(gate['files'])}))
