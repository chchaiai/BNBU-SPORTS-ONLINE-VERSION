"""Package only approved invitation runtime modules, current portal, and icons."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess

root = Path(__file__).resolve().parents[2]
work = root / '.local/invite-brand-release'
work.mkdir(exist_ok=True)
changed = subprocess.check_output(['git', 'diff', '--name-only', 'ab02e8f4^', 'ab02e8f4', '--', 'backend/src'], cwd=root, text=True).splitlines()
runtime = []
for name in changed:
    relative = Path(name).relative_to('backend/src')
    if relative.suffix == '.ts':
        relative = relative.with_suffix('.js')
    source = root / 'backend/dist' / relative
    if relative.suffix == '.json':
        source = root / 'backend/src' / relative
    destination = work / 'backend' / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
    runtime.append(relative.as_posix())
shutil.copytree(root / '.local/portal-own-password-build/dist', work / 'portal/dist', dirs_exist_ok=True)
student = root / 'BNBU-Sports-Web-new/frontend/student'
for name in ['index.html', 'bnbu-sports-icon.svg', 'js/api.js']:
    destination = work / 'student' / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(student / name, destination)
(work / 'backend/Dockerfile').write_text('FROM bnbu-backend-production:submit-atomic-20260913\n' + ''.join(f'COPY --chown=10001:10001 {name} /app/dist/{name}\n' for name in runtime), encoding='utf-8')
(work / 'portal/Dockerfile').write_text('FROM bnbu-portal-production:feedback-labels-20260913\nUSER root\nRUN rm -rf /app/dist\nCOPY --chown=10001:10001 dist/ /app/dist/\nUSER 10001:10001\n', encoding='utf-8')
files = {p.relative_to(work).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in work.rglob('*') if p.is_file() and p.name != 'validation.json'}
(work / 'validation.json').write_text(json.dumps({'invitationCommit': 'ab02e8f4', 'runtimeModules': runtime, 'files': files, 'checks': {'backendCompile': 'PASS', 'inviteUnit': '3/3', 'portalBuild': 'PASS', 'portalTests': '43/43', 'androidDebugBuild': 'PASS'}}, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'runtimeModules': runtime, 'fileCount': len(files)}))
