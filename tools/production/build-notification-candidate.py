"""Verify and build the notification overlay; do not alter running services."""
import hashlib
import json
from pathlib import Path
import subprocess

work = Path('/home/ubuntu/notification-locale-release-v3')
gate = json.loads((work / 'validation.json').read_text())
def output(args):
    return subprocess.check_output(args, text=True).strip()
assert Path('/opt/bnbu-sports-production/current').resolve().name == 'student-notification-copy-20260913'
assert output(['docker', 'inspect', '--format', '{{.Image}}', 'bnbu-sports-production-backend-1']) == gate['baseImages']['backend']
for component, tag in [('backend', 'invite-brand-20260913'), ('migrator', 'ocr-full-20260913')]:
    assert output(['docker', 'image', 'inspect', '--format', '{{.Id}}', f'bnbu-{component}-production:{tag}']) == gate['baseImages'][component]
for name, expected in gate['files'].items():
    path = (work / name).resolve(strict=True)
    assert path.is_relative_to(work)
    assert hashlib.sha256(path.read_bytes()).hexdigest() == expected, name
images = {}
for component in ['backend', 'migrator']:
    tag = f'bnbu-{component}-production:notification-locale-20260913'
    subprocess.run(['docker', 'build', '--pull=false', '-t', tag, str(work / component)], check=True)
    images[component] = output(['docker', 'image', 'inspect', '--format', '{{.Id}}', tag])
def migrations(image):
    script = "const m=await import('./dist/generated/migration-manifest.generated.js');console.log(JSON.stringify(m.foundationMigrations))"
    return json.loads(output(['docker', 'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--entrypoint', 'node', image, '--input-type=module', '-e', script]))
old_migrations = migrations(gate['baseImages']['backend'])
new_migrations = migrations(images['backend'])
assert len(old_migrations) == 75 and new_migrations[:-1] == old_migrations
assert new_migrations[-1]['migrationId'] == gate['migration']
assert new_migrations[-1]['sha256'] == gate['migrationSha256']
probe = "await import('./dist/modules/v8/v81-notifications.js');await import('./dist/modules/client-capabilities/client-messaging.projection.js');const m=await import('./dist/generated/migration-manifest.generated.js');if(m.foundationMigrations.length!==76)throw Error('migration count');console.log('IMPORTS_AND_76_MIGRATIONS_PASS')"
assert output(['docker', 'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--entrypoint', 'node', images['backend'], '--input-type=module', '-e', probe]) == 'IMPORTS_AND_76_MIGRATIONS_PASS'
result = {'result': 'PASS', 'scope': 'Candidate images built; no production migration or service replacement', 'images': images, 'fileCount': len(gate['files'])}
(work / 'build-result.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
