"""Package the tested enrollment delta over the captured live release."""
from pathlib import Path
import hashlib,json,shutil
root=Path(__file__).resolve().parents[2]
work=root/'.local/dual-class-20260922';bundle=work/'bundle';base=work/'baseline'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
delta=[]
def save(name,data):
 p=bundle/'backend/dist'/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
 delta.append({'path':name,'before':sha(base/name) if (base/name).exists() else None,'after':sha(p)})
for name in ['modules/enrollments/application/enrollment-capacity.js','modules/enrollments/application/enrollments.service.js',
 'modules/enrollments/application/qr-join.service.js','modules/enrollments/domain/enrollment.repository.js',
 'modules/enrollments/infrastructure/prisma-enrollment.repository.js','modules/users/users.service.js',
 'modules/users/users.dto.js','modules/users/student-profile-completion.service.js']:
 save(name,(root/'backend/dist'/name).read_bytes())
name='generated/openapi.document.generated.json';doc=json.loads((base/name).read_text(encoding='utf-8'))
new=json.loads((root/'backend/dist'/name).read_text(encoding='utf-8'))
for schema,fields in [('StudentProfile',['maximumActiveEnrollments','activeEnrollmentCount','enrollmentCapacitySemesterId']),('UpdateStudentRequest',['secondClassReason','secondClassSemesterId'])]:
 for field in fields:doc['components']['schemas'][schema]['properties'][field]=new['components']['schemas'][schema]['properties'][field]
save(name,(json.dumps(doc,ensure_ascii=False,indent=2)+'\n').encode())
name='generated/migration-manifest.generated.js';s=(base/name).read_text(encoding='utf-8');manifest=json.loads((root/'backend/prisma/migrations/0090_student_enrollment_capacity/manifest.json').read_text())
assert '0090_student_enrollment_capacity' not in s
s=s.replace('];\nexport const foundationMigration','    '+json.dumps(manifest)+',\n];\nexport const foundationMigration');save(name,s.encode())
shutil.copytree(root/'backend/prisma/migrations/0090_student_enrollment_capacity',bundle/'migrator/prisma/migrations/0090_student_enrollment_capacity',dirs_exist_ok=True)
web=[]
for name in ['js/api.js','js/app.js','js/store.js','js/course-selection.js','js/screens/checkin.js','js/screens/courses.js','js/screens/join.js','js/screens/profile.js','js/screens/services.js']:
 source=root/'BNBU-Sports-Web-new/frontend/student'/name;target=bundle/'web/student'/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target)
 web.append({'path':name,'before':sha(work/'student'/name) if (work/'student'/name).exists() else None,'after':sha(target)})
shutil.copytree(root/'BNBU-Sports-Web-new/portal-teacher-admin/dist',bundle/'portal/dist',dirs_exist_ok=True)
assert not any('dual-class-fixture' in str(p) for p in (bundle/'portal/dist').rglob('*'))
for service in ['backend','migrator','portal']:
 content='COPY --chown=10001:10001 '+('prisma/migrations/ /app/prisma/migrations/' if service=='migrator' else 'dist/ /app/dist/')
 (bundle/service/'Dockerfile').write_text(f'FROM bnbu-{service}-dual-class-base:20260922\n{content}\n')
shutil.copytree(base,work/'candidate/dist',dirs_exist_ok=True);shutil.copytree(bundle/'backend/dist',work/'candidate/dist',dirs_exist_ok=True)
(work/'candidate/package.json').write_text('{"type":"module"}\n')
shutil.copyfile(root/'tools/production/backup-before-bugfix.py',bundle/'backup.py')
for name in ['grant-dual-class-20260922.mjs','verify-dual-class-20260922.mjs','deploy-dual-class-20260922.py']:
 shutil.copyfile(root/'tools/production'/name,bundle/name)
gate={'previous':'pending-query-removed-20260922','baseBackend':'sha256:1c45984aea52068cfa0faddde348b1e1b72a5b3b708891c5056152b10d75d82d','basePortal':'sha256:f15200e977dfa29885f2a49902d309826cfd1e01cb6c1d7c233b5898c8f41cfb','delta':delta,'web':web}
gate['files']={str(p.relative_to(bundle)).replace('\\','/'):sha(p) for p in bundle.rglob('*') if p.is_file() and p.name!='validation.json'}
(bundle/'validation.json').write_text(json.dumps(gate,indent=2))
print(json.dumps({'result':'PACKAGED','backendFiles':len(delta),'studentFiles':len(web)}))
