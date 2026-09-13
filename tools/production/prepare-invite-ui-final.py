from pathlib import Path
import hashlib
import json
import shutil

root = Path(__file__).resolve().parents[2]
work = root / '.local/invite-ui-final-release'
work.mkdir(exist_ok=True)
shutil.copytree(root / '.local/portal-own-password-build/dist', work / 'dist', dirs_exist_ok=True)
script = (root / 'tools/production/deploy-portal-feedback-labels.py').read_text(encoding='utf-8')
script = script.replace('portal-help-copy-20260913', 'invite-brand-20260913').replace('portal-feedback-labels-20260913', 'invite-ui-final-20260913').replace('bnbu-portal-production:feedback-labels-20260913', 'bnbu-portal-production:invite-ui-final-20260913')
script = script.replace('bnbu-portal-production:ocr-full-20260913', 'bnbu-portal-production:invite-brand-20260913')
script = script.replace("'app/feedback-api.ts']", "'app/feedback-api.ts', 'app/teacher-data.ts', 'app/layout.tsx']")
target = root / 'tools/production/deploy-invite-ui-final.py'
target.write_text(script, encoding='utf-8')
shutil.copyfile(target, work / target.name)
(work / 'Dockerfile').write_text('FROM bnbu-portal-production:invite-brand-20260913\nUSER root\nRUN rm -rf /app/dist\nCOPY --chown=10001:10001 dist/ /app/dist/\nUSER 10001:10001\n', encoding='utf-8')
gate = json.loads((root / '.local/portal-feedback-labels-release/validation.json').read_text(encoding='utf-8'))
gate['baseImage'] = 'sha256:182a9d232c395fae913021f9182aabc8d1ab93c3f1265b7204d9773189b43ced'
gate['changedSourceFiles'] += ['app/teacher-data.ts', 'app/layout.tsx']
gate['patches'] += ['ab02e8f4', 'official-icons-and-invite-input-limit']
gate['files'] = {p.relative_to(work).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in work.rglob('*') if p.is_file() and p.name != 'validation.json'}
(work / 'validation.json').write_text(json.dumps(gate, indent=2)+'\n', encoding='utf-8')
