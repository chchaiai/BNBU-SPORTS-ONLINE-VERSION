"""Build a scoped notification release overlay without unrelated worktree changes."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess

root = Path(__file__).resolve().parents[2]
work = root / '.local/notification-locale-release-v3'
work.mkdir(exist_ok=False)
runtime = [
    'modules/v8/v81-notifications.js',
    'modules/v8/domain/notification-content.js',
    'modules/v8/domain/notification-history.js',
    'modules/client-capabilities/client-messaging.projection.js',
    'generated/migration-manifest.generated.js',
    'generated/openapi.document.generated.json',
    'generated/openapi.manifest.generated.json',
]
for name in runtime:
    source = root / 'backend/dist' / name
    if name.endswith('.json'):
        source = root / 'backend/src' / name
    destination = work / 'backend' / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
shutil.copytree(root / 'backend/dist/generated/prisma', work / 'backend/generated/prisma')
(work / 'backend/Dockerfile').write_text(
    'FROM bnbu-backend-production:invite-brand-20260913\n'
    + ''.join(f'COPY --chown=10001:10001 {name} /app/dist/{name}\n' for name in runtime)
    + 'COPY --chown=10001:10001 generated/prisma/ /app/dist/generated/prisma/\n', encoding='utf-8')
migration = '0076_notification_review_content'
for name in ['migration.sql', 'manifest.json']:
    target = work / 'migrator/prisma/migrations' / migration / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(subprocess.check_output(['git', 'show', f'HEAD:backend/prisma/migrations/{migration}/{name}'], cwd=root))
manifest = json.loads((target.parent / 'manifest.json').read_text())
assert hashlib.sha256((target.parent / 'migration.sql').read_bytes()).hexdigest() == manifest['sha256']
(work / 'migrator/Dockerfile').write_text(
    'FROM bnbu-migrator-production:ocr-full-20260913\n'
    f'COPY --chown=node:node prisma/migrations/{migration}/ /app/prisma/migrations/{migration}/\n', encoding='utf-8')
for name in ['js/api.js', 'js/notification-text.js', 'js/screens/notifications.js']:
    target = work / 'student' / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(root / 'BNBU-Sports-Web-new/frontend/student' / name, target)
files = {p.relative_to(work).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in work.rglob('*') if p.is_file()}
gate = {'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
        'baseImages': {'backend': 'sha256:c676a33218fc069cc6c57a14d36a96420bfeb8bb36facb84939cff8826b68055',
                       'migrator': 'sha256:bd7e9f60eab967dccb0347a148712c71caf2dd6e721d26b6e824a8ba92347524'},
        'runtimeModules': runtime, 'migration': migration, 'migrationSha256': manifest['sha256'], 'files': files,
        'scope': 'Prepared overlay only; deployment and historical backfill pending'}
(work / 'validation.json').write_text(json.dumps(gate, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'result': 'PREPARED', 'fileCount': len(files), 'migrationSha256': manifest['sha256']}))
