import hashlib,json,shutil,tarfile,urllib.request,re
from pathlib import Path
root=Path(__file__).resolve().parents[2];e=root/'evidence/feedback-20260918';artifact=root/'.local/feedback-20260918';bundle=artifact/'bundle-final'
assert not bundle.exists();bundle.mkdir()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
baseline=json.loads((artifact/'baseline/baseline.json').read_text());delta=[]
runtime=['common/object-storage/media-storage.port.js','common/object-storage/s3-media-storage.adapter.js','common/policy/v81-admin-permission.guard.js','generated/operation-policies.generated.js','modules/client-capabilities/feedback-attachments.js','modules/client-capabilities/client-capabilities.dto.js','modules/client-capabilities/client-capabilities.module.js','modules/client-capabilities/client-messaging.service.js','modules/v8/v81-feedback.js','generated/openapi.document.generated.json','generated/openapi.manifest.generated.json']
def copy(source,name):
 target=bundle/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target)
for name in runtime:
 source=root/'backend/dist'/name;old=artifact/'baseline/backend/dist'/name
 if not source.exists():source=root/'backend/src'/name
 assert source.exists(),name
 delta.append({'path':name,'before':sha(old) if old.exists() else None,'after':sha(source)});copy(source,'backend/dist/'+name)
 if source.suffix=='.js' and source.with_suffix('.js.map').exists():copy(source.with_suffix('.js.map'),'backend/dist/'+name+'.map')
# Only add the requested additive migration to the deployed registry. 0084 is unrelated and is not released.
migration='0086_feedback_attachments';m=json.loads((root/'backend/prisma/migrations'/migration/'manifest.json').read_text())
name='generated/migration-manifest.generated.js';old=artifact/'baseline/backend/dist'/name;target=bundle/'backend/dist'/name
source=old.read_text();assert '0084' not in source and source.count('\n];')==1
source=source.replace('];',"    {migrationId: '"+migration+"', sha256: '"+m['sha256']+"', destructive: false},\n];",1);target.write_text(source,encoding="utf-8",newline="\n")
delta.append({'path':name,'before':sha(old),'after':sha(target)})
shutil.copytree(root/'BNBU-Sports-Web-new/portal-teacher-admin/dist',bundle/'portal/dist')
shutil.copytree(root/'backend/prisma/migrations'/migration,bundle/'migrator/prisma/migrations'/migration)
registry=(root/'backend/scripts/migration-registry.mjs').read_text().replace("  '0084_ai_review_decisions',\n",'')
(bundle/'migrator/scripts').mkdir(parents=True);(bundle/'migrator/scripts/migration-registry.mjs').write_text(registry)
for s in ['backend','portal','migrator']:
 text=f'FROM bnbu-{s}-feedback-final-base:20260918\n'
 text+='COPY --chown=10001:10001 dist/ /app/dist/\n' if s!='migrator' else 'COPY --chown=node:node prisma/ /app/prisma/\nCOPY --chown=node:node scripts/ /app/scripts/\n'
 (bundle/s/'Dockerfile').write_text(text)
web=[]
for name in ['js/api.js','js/screens/support.js','css/components.css']:
 source=root/'BNBU-Sports-Web-new/frontend/student'/name
 with urllib.request.urlopen('https://www.student.bnbusports.cn/student/'+name,timeout=30) as response:before=hashlib.sha256(response.read()).hexdigest()
 copy(source,'web/student/'+name);web.append({'path':name,'before':before,'after':sha(source)})
for source,target in [('deploy-feedback-20260918.py','deploy.py'),('backup-before-bugfix.py','backup.py'),('feedback-storage-smoke.mjs','storage-smoke.mjs'),('run-feedback-storage-smoke.py','storage-smoke.py')]:copy(root/'tools/production'/source,target)
gate={**baseline,'delta':delta,'web':web,'migration':migration,'checks':{'http':json.loads((e/'http.json').read_text()),'browser':json.loads((e/'browser.json').read_text()),'messagingUnitTests':8},'files':{p.relative_to(bundle).as_posix():sha(p) for p in bundle.rglob('*') if p.is_file()}}
(bundle/'validation.json').write_text(json.dumps(gate,indent=2))
with tarfile.open(artifact/'bundle-final.tar.gz','w:gz') as t:
 for p in bundle.iterdir():t.add(p,arcname=p.name)
print(json.dumps({'result':'PACKAGED','runtimeFiles':len(delta),'studentFiles':len(web),'sha256':sha(artifact/'bundle-final.tar.gz')}))
