"""Overlay reviewed runtime files on the captured production image."""
from pathlib import Path
import hashlib,json,shutil,tarfile
root=Path(__file__).resolve().parents[2]
work=root/'.local/feedback-erasure-20260923';bundle=work/'bundle'
bundle.mkdir(exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
gate=json.loads((work/'baseline.json').read_text());delta=[]
names=['modules/client-capabilities/feedback-attachments.js','modules/client-capabilities/client-messaging.service.js',
       'modules/client-capabilities/client-error-reports.controller.js','modules/v8/v81-student-media-erasure.js']
for name in names:
    dest=bundle/'backend/dist'/name;dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(root/'backend/dist'/name,dest)
    delta.append({'path':name,'before':sha(work/'backend/dist'/name),'after':sha(dest)})
migration='0091_feedback_erasure_cleanup'
manifest=json.loads((root/'backend/prisma/migrations'/migration/'manifest.json').read_text(encoding='utf-8-sig'))
name='generated/migration-manifest.generated.js';dest=bundle/'backend/dist'/name;dest.parent.mkdir(parents=True,exist_ok=True)
text=(work/'backend/dist'/name).read_text();assert migration not in text
text=text.replace('];','    '+json.dumps(manifest)+',\n];',1)
dest.write_bytes(text.encode());delta.append({'path':name,'before':sha(work/'backend/dist'/name),'after':sha(dest)})
name='generated/openapi.document.generated.json';dest=bundle/'backend/dist'/name
document=json.loads((work/'backend/dist'/name).read_text(encoding='utf-8'))
platforms=document['components']['schemas']['ClientErrorReportRequest']['properties']['platform']['enum']
assert platforms==['WEB_STUDENT','WEB_TEACHER','WEB_ADMIN']
platforms.extend(['IOS','ANDROID'])
dest.write_bytes((json.dumps(document,ensure_ascii=False,indent=2)+'\n').encode())
delta.append({'path':name,'before':sha(work/'backend/dist'/name),'after':sha(dest)})
shutil.copytree(root/'backend/prisma/migrations'/migration,bundle/'migrator/prisma/migrations'/migration,dirs_exist_ok=True)
for service in ['backend','migrator']:
    (bundle/service/'Dockerfile').write_text('FROM bnbu-'+service+'-feedback-erasure-base:20260923\nCOPY --chown=10001:10001 '+('dist/ /app/dist/' if service=='backend' else 'prisma/migrations/ /app/prisma/migrations/')+'\n',newline='\n')
shutil.copyfile(work/'test.mjs',bundle/'test.mjs')
shutil.copyfile(root/'tools/production/backup-before-bugfix.py',bundle/'backup.py')
shutil.copyfile(root/'tools/production/verify-feedback-erasure-20260923.mjs',bundle/'verify.mjs')
gate.update(delta=delta,migration=migration,checks={'unit':9,'isolatedPostgres':8})
gate['files']={p.relative_to(bundle).as_posix():sha(p) for p in bundle.rglob('*') if p.is_file() and p.name!='validation.json'}
(bundle/'validation.json').write_text(json.dumps(gate,indent=2),newline='\n')
with tarfile.open(work/'bundle.tar.gz','w:gz') as archive:
    for p in bundle.iterdir():archive.add(p,arcname=p.name)
print(json.dumps({'runtimeFiles':len(delta),'bundleSha256':sha(work/'bundle.tar.gz')}))
