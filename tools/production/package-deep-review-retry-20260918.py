from pathlib import Path
import hashlib,json,shutil,subprocess,tarfile
root=Path(__file__).resolve().parents[2];e=root/'evidence/deep-review-20260918';bundle=e/'retry-v2';assert not bundle.exists();bundle.mkdir()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
path='modules/exercise-records/application/exercise-records.service.js'
for suffix in ['', '.map']:
 target=bundle/'backend/dist'/(path+suffix);target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/'backend/dist'/(path+suffix),target)
assert 'temporary compute' in (bundle/'backend/dist'/path).read_text()
manifest=json.loads((e/'source-manifest.json').read_text())
for name in list(manifest)+['backend/test/unit/deep-review-submit.test.ts','tools/production/deploy-deep-review-retry-20260918.py','tools/production/package-deep-review-retry-20260918.py']:manifest[name]=sha(root/name)
(bundle/'source-manifest.json').write_text(json.dumps(manifest,indent=2))
previous=json.loads((e/'deployment.json').read_text())
(bundle/'backend/Dockerfile').write_text('FROM bnbu-backend-deep-review-retry-base:20260918\nCOPY --chown=10001:10001 dist/ /app/dist/\nLABEL org.opencontainers.image.revision="'+previous['sourceHead']+'" org.bnbu.source-manifest-sha256="'+sha(bundle/'source-manifest.json')+'"\n')
shutil.copyfile(root/'tools/production/deploy-deep-review-retry-20260918.py',bundle/'deploy.py')
gate={'previousImage':previous['backendImage'],'sourceHead':previous['sourceHead'],'sourceManifestSha256':sha(bundle/'source-manifest.json'),'runtimePath':path,'runtimeAfter':sha(bundle/'backend/dist'/path),'files':{p.relative_to(bundle).as_posix():sha(p) for p in bundle.rglob('*') if p.is_file()}}
(bundle/'validation.json').write_text(json.dumps(gate,indent=2))
with tarfile.open(e/'retry-v2.tar.gz','w:gz') as tar:
 for p in bundle.iterdir():tar.add(p,arcname=p.name)
print(json.dumps({'result':'PACKAGED','bundleSha256':sha(e/'retry-v2.tar.gz'),'sourceManifestSha256':gate['sourceManifestSha256']}))
