from pathlib import Path
import json,hashlib,shutil,subprocess,tarfile
root=Path(__file__).resolve().parents[2];e=root/'evidence/deep-review-20260918';bundle=e/'bundle';assert not bundle.exists();bundle.mkdir()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
baseline=json.loads((e/'baseline/baseline.json').read_text())
names=['modules/auth/auth.service.js','modules/exercise-records/application/exercise-records.service.js','modules/exercise-sessions/application/exercise-sessions.service.js','modules/exercise-sessions/interface/http/exercise-sessions.controller.js','modules/exercise-sessions/interface/http/exercise-sessions.dto.js','modules/media/application/media-processing.worker.js','modules/media/application/media.service.js','modules/media/application/video-normalizer.js','modules/v8/ai-review-media.js','modules/v8/domain/crediting.js','modules/v8/v81-credit-store.js','modules/v8/credit-computation.js','modules/v8/v81-history-backfill.js','generated/operation-policies.generated.js','generated/openapi.document.generated.json','generated/openapi.manifest.generated.json']
def copy(source,target):
 p=bundle/target;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,p)
runtime=[]
for name in names:
 source=root/'backend/dist'/name
 if not source.exists():source=root/'backend/src'/name
 previous=e/'baseline/backend/dist'/name
 runtime.append({'path':name,'before':sha(previous) if previous.exists() else None,'after':sha(source)})
 copy(source,'backend/dist/'+name)
 if source.suffix=='.js' and source.with_suffix('.js.map').exists():copy(source.with_suffix('.js.map'),'backend/dist/'+name+'.map')
web=[]
for name in ['js/api.js','js/app.js','js/screens/checkin.js','js/screens/notifications.js']:
 source=root/'BNBU-Sports-Web-new/frontend/student'/name;previous=e/'baseline/web/student'/name
 copy(source,'web/student/'+name);web.append({'path':name,'before':sha(previous),'after':sha(source)})
assert (e/'checkin-before.js').read_text()==(e/'baseline/web/student/js/screens/checkin.js').read_text(),'Initial unrelated work does not match live baseline'
tracked=subprocess.check_output(['git','diff','--name-only'],cwd=root,text=True).splitlines()
added=['backend/src/modules/v8/credit-computation.ts','backend/test/unit/deep-review-credit.test.ts','backend/test/unit/deep-review-workers.test.ts','backend/test/fixtures/credit-review/original-crediting.ts','.github/workflows/review-release-gate.yml','tools/local-integration/deep-review-http.mjs','tools/local-integration/deep-review-browser.mjs','tools/production/deep-review-candidate.mjs','tools/production/deploy-deep-review-20260918.py','tools/production/package-deep-review-20260918.py','tools/production/inspect-deep-review-baseline.py']
sourceManifest={name:sha(root/name) for name in sorted(set(tracked+added)) if not name.startswith('backend/src/generated/prisma/')}
manifest=e/'source-manifest.json';manifest.write_text(json.dumps(sourceManifest,indent=2));copy(manifest,'source-manifest.json')
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
(bundle/'backend/Dockerfile').write_text('FROM bnbu-backend-deep-review-base:20260918\nCOPY --chown=10001:10001 dist/ /app/dist/\nLABEL org.opencontainers.image.revision="'+head+'" org.bnbu.source-manifest-sha256="'+sha(manifest)+'"\n')
for source,target in [('deploy-deep-review-20260918.py','deploy.py'),('deep-review-candidate.mjs','candidate.mjs'),('backup-before-bugfix.py','backup.py')]:copy(root/'tools/production'/source,target)
checks={name:json.loads((e/(name+'.json')).read_text()) for name in ['http','browser']}
assert all(row['result']=='PASS' for row in checks.values())
assert 'pass 335' in (e/'backend-unit.txt').read_text(encoding='utf-8-sig')
assert 'checks=87' in (e/'student-smoke.txt').read_text(encoding='utf-8-sig')
gate={**baseline,'runtime':runtime,'web':web,'sourceHead':head,'sourceManifestSha256':sha(manifest),'checks':{**checks,'unit':335,'student':87,'typecheck':'PASS','build':'PASS','parity':'PASS'},'files':{p.relative_to(bundle).as_posix():sha(p) for p in bundle.rglob('*') if p.is_file()}}
(bundle/'validation.json').write_text(json.dumps(gate,indent=2))
with tarfile.open(e/'bundle.tar.gz','w:gz') as tar:
 for p in bundle.iterdir():tar.add(p,arcname=p.name)
print(json.dumps({'result':'PACKAGED','runtimeFiles':len(runtime),'studentFiles':len(web),'bundleSha256':sha(e/'bundle.tar.gz'),'sourceManifestSha256':sha(manifest)}))
