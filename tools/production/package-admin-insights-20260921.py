"""Build the reviewed delta on the captured production runtime."""
from pathlib import Path
import hashlib,json,re,shutil
ROOT=Path(__file__).resolve().parents[2]
work=ROOT/'.local/admin-analytics';bundle=work/'bundle';base=work/'baseline'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
delta=[]
def save(name,data):
 p=bundle/'backend/dist'/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
 delta.append({'path':name,'before':sha(base/name) if (base/name).exists() else None,'after':sha(p)})
for name in ['modules/v8/v81.module.js','common/policy/v81-admin-permission.guard.js',
 'modules/exercise-records/application/exercise-records.service.js','modules/exercise-records/interface/http/exercise-records.dto.js',
 'modules/v8/v81-record-projection.js','modules/v8/v81-management-insights.js','modules/v8/domain/sport-display.js']:
 save(name,(ROOT/'backend/dist'/name).read_bytes())
name='generated/operation-policies.generated.js'
s=(base/name).read_text(encoding='utf-8');new=(ROOT/'backend/dist'/name).read_text(encoding='utf-8')
for op in ['getV81ManagementInsights','getV81TeacherDetails','updateV81TeacherDetails']:
 match=re.search(r'    "'+op+r'": \{.*?\n    \}',new,re.S);assert match and '"'+op+'"' not in s
 s=s.replace('export const operationPolicies = {','export const operationPolicies = {\n'+match.group()+',',1)
save(name,s.encode())
name='generated/openapi.document.generated.json';doc=json.loads((base/name).read_text());new=json.loads((ROOT/'backend/dist'/name).read_text())
for route in ['/admin/insights','/admin/teachers/{id}/details']:doc['paths'][route]=new['paths'][route]
doc['paths']['/exercise-records']['get']=new['paths']['/exercise-records']['get']
for schema,fields in [('PaginationMeta',['total','totalPages']),('ExerciseRecord',['startedAt','endedAt'])]:
 for field in fields:doc['components']['schemas'][schema]['properties'][field]=new['components']['schemas'][schema]['properties'][field]
save(name,(json.dumps(doc,ensure_ascii=False,indent=2)+'\n').encode())
name='generated/migration-manifest.generated.js';s=(base/name).read_text();manifest=json.loads((ROOT/'backend/prisma/migrations/0089_teacher_notes/manifest.json').read_text())
assert '0089_teacher_notes' not in s;s=s.replace('];\nexport const foundationMigration','    '+json.dumps(manifest)+',\n];\nexport const foundationMigration');save(name,s.encode())
shutil.copytree(ROOT/'backend/prisma/migrations/0089_teacher_notes',bundle/'migrator/prisma/migrations/0089_teacher_notes',dirs_exist_ok=True)
shutil.copytree(ROOT/'BNBU-Sports-Web-new/portal-teacher-admin/dist',bundle/'portal/dist',dirs_exist_ok=True)
assert not any('insights-qa-local' in str(p) for p in (bundle/'portal/dist').rglob('*'))
s=(work/'student-checkin-baseline.js').read_text(encoding='utf-8');current=(ROOT/'BNBU-Sports-Web-new/frontend/student/js/screens/checkin.js').read_text(encoding='utf-8')
start=current.index('  const schedule = /^(?:mon');end=current.index('\n  return { sportType: OTHER',start)
needle='  const displayName = paren || name || "课程运动";';assert s.count(needle)==1;s=s.replace(needle,current[start:end])
p=bundle/'web/student/js/screens/checkin.js';p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s,encoding='utf-8',newline='\n')
web=[{'path':'js/screens/checkin.js','before':sha(work/'student-checkin-baseline.js'),'after':sha(p)}]
for service in ['backend','migrator','portal']:
 content='COPY --chown=10001:10001 '+('prisma/migrations/ /app/prisma/migrations/' if service=='migrator' else 'dist/ /app/dist/')
 (bundle/service/'Dockerfile').write_text(f'FROM bnbu-{service}-insights-base:20260921\n{content}\n')
shutil.copytree(base,work/'candidate/dist',dirs_exist_ok=True);shutil.copytree(bundle/'backend/dist',work/'candidate/dist',dirs_exist_ok=True)
(work/'candidate/package.json').write_text('{"type":"module"}\n')
shutil.copyfile(ROOT/'tools/production/backup-before-bugfix.py',bundle/'backup.py')
gate={'previous':'proof-storage-pixels-20260920','baseBackend':'sha256:f2bf9ed7bc243494b84ba03d6f0e229c6add1eff605ffb27f2f26c5cab4bdb5d',
 'basePortal':'sha256:211a8e1b552ddea128d8484b55e68d4ae766869ef2817893a975709278f8a90b','delta':delta,'web':web}
(bundle/'validation.json').write_text(json.dumps(gate,indent=2))
print(json.dumps({'result':'PACKAGED','backendFiles':len(delta),'studentFiles':len(web),'migration':'0089_teacher_notes'}))
