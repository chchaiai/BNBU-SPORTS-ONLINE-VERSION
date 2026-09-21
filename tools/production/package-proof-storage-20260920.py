from pathlib import Path
import hashlib,json,shutil
base=Path('evidence/proof-storage-20260920');bundle=base/'bundle'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
changes={
 'common/config/environment.js':[("maxImagePixels: integer(raw, 'MEDIA_MAX_IMAGE_PIXELS', { minimum: 1 })","maxImagePixels: integer(raw, 'MEDIA_MAX_IMAGE_PIXELS', { minimum: 0 })")],
 'modules/media/application/media-validator.js':[
  ('limitInputPixels: config.maxImagePixels,','limitInputPixels: config.maxImagePixels === 0 ? false : config.maxImagePixels,'),
  ('width < 1 || height < 1 || width * height > maximumPixels','width < 1 || height < 1 || (maximumPixels > 0 && width * height > maximumPixels)')]
}
delta=[]
for name,edits in changes.items():
 old=base/'backend-baseline'/name;p=bundle/'backend/dist'/name;p.parent.mkdir(parents=True,exist_ok=True)
 s=old.read_text()
 for before,after in edits:assert s.count(before)==1;s=s.replace(before,after)
 p.write_text(s,newline='\n');delta.append({'path':name,'before':sha(old),'after':sha(p)})
(bundle/'backend/Dockerfile').write_text('FROM bnbu-proof-storage-base:20260920\nCOPY --chown=10001:10001 dist/ /app/dist/\n')
web=[]
for name in ['js/checkin-drafts.js','js/api.js','js/screens/checkin.js']:
 p=bundle/'web/student'/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(base/'candidate'/name,p)
 web.append({'path':name,'before':sha(base/'baseline'/name),'after':sha(p)})
shutil.copyfile('tools/production/verify-proof-storage-20260920.mjs',bundle/'verify.mjs')
browser=json.loads((base/'browser.json').read_text());assert browser['result']=='PASS' and len(browser['scenarios'])==3
gate={'previous':'browser-open-all-20260920','baseBackend':'sha256:6e380354ec53871aedbb860a0c1aef59cbde76bf479aa5256ab7b9ca5f57251e',
 'delta':delta,'web':web,'checks':{'frontend':25,'backendMedia':25,'browser':3},
 'files':{str(p.relative_to(bundle)).replace('\\','/'):sha(p) for p in bundle.rglob('*') if p.is_file() and p.name!='validation.json'}}
(bundle/'validation.json').write_text(json.dumps(gate,indent=2))
print(json.dumps({'files':list(gate['files']),'delta':delta,'web':web}))
