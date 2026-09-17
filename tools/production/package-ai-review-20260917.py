"""Only allow inspected AI runtime deltas; preserve unrelated production artifacts."""
import hashlib,json,shutil,tarfile
from pathlib import Path
root=Path(__file__).resolve().parents[2];e=root/'evidence/ai-review-20260917';bundle=e/'bundle';assert not bundle.exists();bundle.mkdir()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
baseline=json.loads((e/'baseline/baseline.json').read_text());delta=[]
allowed=['common/config/environment.js','common/config/file-json-secret-loader.js','generated/migration-manifest.generated.js','generated/openapi.document.generated.json','modules/exercise-records/application/exercise-records.service.js','modules/exercise-records/interface/http/exercise-records.dto.js','modules/v8/v81-materials.js','modules/v8/v81-record-projection.js','modules/v8/v81-record-state.js','modules/v8/v81.module.js']
def copy(source,destination):
 p=bundle/destination;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,p)
for p in (root/'backend/dist').rglob('*'):
 if not p.is_file() or p.suffix not in ['.js','.json']:continue
 name=p.relative_to(root/'backend/dist').as_posix();old=e/'baseline/backend/dist'/name
 if old.exists() and sha(old)==sha(p):continue
 assert name in allowed or name.startswith('generated/prisma/') or (name.startswith('modules/v8/') and 'ai-review' in name),name
 delta.append({'path':name,'before':sha(old) if old.exists() else None,'after':sha(p)});copy(p,'backend/dist/'+name)
 if p.with_suffix('.js.map').exists():copy(p.with_suffix('.js.map'),'backend/dist/'+name+'.map')
shutil.copytree(root/'BNBU-Sports-Web-new/portal-teacher-admin/dist',bundle/'portal/dist')
shutil.copytree(root/'backend/prisma/migrations/0083_ai_review_advisory',bundle/'migrator/prisma/migrations/0083_ai_review_advisory')
copy(root/'backend/scripts/migration-registry.mjs','migrator/scripts/migration-registry.mjs')
copy(root/'backend/prisma/schema.prisma','migrator/prisma/schema.prisma')
for s in ['backend','portal','migrator']:
 text=f'FROM bnbu-{s}-ai-review-base:20260917\n'
 text+='COPY --chown=10001:10001 dist/ /app/dist/\n' if s!='migrator' else 'COPY --chown=node:node prisma/ /app/prisma/\nCOPY --chown=node:node scripts/ /app/scripts/\n'
 (bundle/s/'Dockerfile').write_text(text)
copy(root/'tools/production/deploy-ai-review-20260917.py','deploy.py');copy(root/'tools/production/backup-before-bugfix.py','backup.py')
gate={'previous':baseline['release'],'baseImages':baseline['baseImages'],'delta':delta,'checks':{'unit':325,'http':20,'databaseWorker':1,'portal':18},'files':{p.relative_to(bundle).as_posix():sha(p) for p in bundle.rglob('*') if p.is_file()}}
(bundle/'validation.json').write_text(json.dumps(gate,indent=2))
with tarfile.open(e/'bundle.tar.gz','w:gz') as archive:
 for p in bundle.iterdir():archive.add(p,arcname=p.name)
print(json.dumps({'files':len(gate['files']),'runtimeDeltas':len(delta),'sha256':sha(e/'bundle.tar.gz')}))
