"""Build an explicit local archive path list; no push or worktree reset."""
import hashlib,json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2]
def git(*args):return subprocess.check_output(['git',*args],cwd=root).decode('utf-8')
staged=set(filter(None,git('diff','--cached','--name-only','-z').split('\0')))
previousList=root/'.local/demand-20260916-archive-paths.txt'
assert not staged or previousList.exists() and staged<=set(previousList.read_text().splitlines()),'Existing unrelated staged work must be reviewed separately'
changed=set(git('diff','--name-only','-z').split('\0'))|set(git('ls-files','--others','--exclude-standard','-z').split('\0'))|staged
explicit={'demand.md','docs/business/10-student-flow.md','docs/backend-contracts/openapi.yaml','docs/backend-contracts/05-permission-matrix.md','docs/backend-contracts/backend-implementation-roadmap.md','docs/implementation/demand-20260916-progress.md','docs/implementation/demand-20260916-acceptance.md',
 'tools/local-integration/compose.demand-20260916.yml','tools/local-integration/demand-admin-browser.mjs','tools/local-integration/demand-browser-acceptance.mjs','tools/local-integration/demand-browser-server.mjs','tools/local-integration/demand-upload-browser.mjs','tools/local-integration/demand-video-browser.mjs',
 'tools/local-integration/v81-makeup-http-probe.mjs','tools/local-integration/v81-makeup-session-probe.d.mts','tools/local-integration/v81-makeup-session-probe.mjs','tools/local-integration/v81-settlement-http-probe.mjs','tools/local-integration/archive-demand-20260916.py'}
paths=[]
for name in sorted(changed):
 if not name:continue
 if name in explicit or name.startswith(('backend/src/','backend/test/','backend/scripts/','backend/prisma/migrations/','BNBU-Sports-Web-new/frontend/student/','BNBU-Sports-Web-new/portal-teacher-admin/')) or name in ['backend/Dockerfile','backend/runtime-coverage.manifest.json'] or name.startswith('tools/production/') and 'demand-20260916' in name and '__pycache__' not in name:
  paths.append(name)
e=root/'evidence/demand-20260916'
for p in e.iterdir():
 if p.is_file() and p.name not in ['production-baseline.tar.gz','production-diff.log','archive-manifest.json']:paths.append(p.relative_to(root).as_posix())
for folder in ['browser','online']:
 for p in (e/folder).iterdir():
  if p.is_file() and p.name!='maintenance-failure.png':paths.append(p.relative_to(root).as_posix())
paths.append('evidence/demand-20260916/release-bundle/validation.json')
paths=sorted(set(paths))
assert all((root/p).is_file() for p in paths)
assert all(not any(x in p for x in ['private.json','__pycache__','.local/']) for p in paths)
manifest={'scope':'Confirmed demand requirements plus already deployed media/mail/credit prerequisites needed to rebuild this tested source snapshot. Unrelated previous deployment artifacts and private sessions remain outside the commit.',
 'files':[{'path':p,'sha256':hashlib.sha256((root/p).read_bytes()).hexdigest()} for p in paths]}
(e/'archive-manifest.json').write_text(json.dumps(manifest,indent=2))
paths.append('evidence/demand-20260916/archive-manifest.json')
(root/'.local/demand-20260916-archive-paths.txt').write_text('\n'.join(paths)+'\n')
print(json.dumps({'files':len(paths),'pathList':'.local/demand-20260916-archive-paths.txt'}))
