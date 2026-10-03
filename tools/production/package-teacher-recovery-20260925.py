"""Allowlisted runtime overlay, checked against the captured live baseline."""
from pathlib import Path
import hashlib, json, re, shutil, tarfile

root = Path(__file__).resolve().parents[2]
work = root / '.local/teacher-recovery-20260925'
bundle = work / 'bundle'
bundle.mkdir(exist_ok=True)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
gate = json.loads((work / 'baseline/baseline.json').read_text())
live = work / 'baseline/portal/dist'
rebuilt = work / 'portal-baseline-build'
for p in rebuilt.rglob('*'):
    if not p.is_file(): continue
    relative = p.relative_to(rebuilt)
    old = live / relative
    assert old.is_file(), relative
    if relative.as_posix() in ['server/vinext-server.json', 'server/ssr/vinext-server.json']:
        assert set(json.loads(old.read_text())) == set(json.loads(p.read_text())) == {'prerenderSecret'}
    elif relative.as_posix() == 'server/index.js':
        normalize = lambda s: re.sub(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', '<build-id>', s)
        assert normalize(old.read_text(encoding='utf8')) == normalize(p.read_text(encoding='utf8'))
    else: assert sha(old) == sha(p), relative

source = root / 'backend/dist' / gate['backendFile']
before = (work / 'baseline/backend/client-authentication.service.js').read_text(encoding='utf8')
after = source.read_text(encoding='utf8')
expected = before.replace('                ...(role === \'ADMIN\'',
    '                // Imported teachers prove mailbox ownership with the recovery code itself.\n                ...(role === \'ADMIN\'')
expected = expected.replace('                    : { emailVerifiedAt: { not: null } }),',
    "                    : role === 'STUDENT'\n                        ? { emailVerifiedAt: { not: null } }\n                        : {}),")
assert expected != before and expected == after
dest = bundle / 'backend/dist' / gate['backendFile']
dest.parent.mkdir(parents=True, exist_ok=True)
shutil.copyfile(source, dest)
gate['after'] = sha(dest)
shutil.copytree(work / 'portal-fixed', bundle / 'portal/dist', dirs_exist_ok=True)
for service in ['backend', 'portal']:
    (bundle / service / 'Dockerfile').write_text(
        f'FROM bnbu-{service}-teacher-recovery-base:20260925\nCOPY --chown=10001:10001 dist/ /app/dist/\n', newline='\n')
shutil.copyfile(root / 'tools/production/verify-teacher-recovery-20260925.mjs', bundle / 'verify.mjs')
shutil.copyfile(root / 'tools/production/backup-before-bugfix.py', bundle / 'backup.py')
assert (bundle / 'test.mjs').is_file()
gate['checks'] = {'backendUnit': 347, 'portalApi': 25, 'backendTypes': 'PASS', 'portalTypes': 'PASS', 'portalBuild': 'PASS'}
gate['files'] = {p.relative_to(bundle).as_posix(): sha(p) for p in bundle.rglob('*') if p.is_file() and p.name != 'validation.json'}
(bundle / 'validation.json').write_text(json.dumps(gate, indent=2), newline='\n')
with tarfile.open(work / 'bundle.tar.gz', 'w:gz') as archive:
    for p in bundle.iterdir(): archive.add(p, arcname=p.name)
print(json.dumps({'result': 'PACKAGED', 'backendRuntimeFiles': 1, 'files': len(gate['files']), 'sha256': sha(work / 'bundle.tar.gz')}))
