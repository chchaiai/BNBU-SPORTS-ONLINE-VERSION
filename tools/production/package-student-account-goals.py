"""Prepare only reviewed changes on the captured production baseline."""
from pathlib import Path
import difflib,hashlib,json,shutil,subprocess
ROOT=Path(__file__).resolve().parents[2];work=ROOT/'.local/student-account-goals';bundle=work/'bundle'
bundle.mkdir(exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
delta=[];web=[]
def save(name,data):
 p=bundle/'backend/dist'/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
 delta.append({'path':name,'before':sha(work/'dist'/name),'after':sha(p)})
for name in ['v81-account-deletion','v81-admin-course-directory','v81-course-reminders','v81-progress','v81-composite-roster']:
 name='modules/v8/'+name+'.js';save(name,(ROOT/'backend/dist'/name).read_bytes())
name='modules/v8/domain/crediting.js';s=(work/'dist'/name).read_text(encoding='utf-8');needle='    validateCreditRules(rules);'
assert s.count(needle)==1
s=s.replace(needle,needle+"\n    if (rules.courseTarget === 0) candidates = candidates.map(record => record.category === 'COURSE_RELATED' ? { ...record, category: 'GENERAL' } : record);")
save(name,s.encode())
name='generated/operation-policies.generated.js';s=(work/'dist'/name).read_text(encoding='utf-8');new=(ROOT/'backend/dist'/name).read_text(encoding='utf-8')
a=new.index('    "confirmCurrentUserAccountDeletion":');b=new.index('    "getV81OcrService":',a)
assert '"confirmCurrentUserAccountDeletion"' not in s;s=s.replace('    "getV81OcrService":',new[a:b]+'    "getV81OcrService":');save(name,s.encode())
name='generated/openapi.document.generated.json';s=json.loads((work/'dist'/name).read_text(encoding='utf-8'));new=json.loads((ROOT/'backend/dist'/name).read_text(encoding='utf-8'))
for route in ['/me/account-deletion-challenges','/me/account-deletion-challenges/{id}/confirm']:s['paths'][route]=new['paths'][route]
save(name,(json.dumps(s,ensure_ascii=False,separators=(',',':'))+'\n').encode())
name='generated/migration-manifest.generated.js';s=(work/'dist'/name).read_text(encoding='utf-8');manifest=json.loads((ROOT/'backend/prisma/migrations/0088_student_self_erasure/manifest.json').read_text())
assert '0088_student_self_erasure' not in s;s=s.replace('];\nexport const foundationMigration', '    '+json.dumps(manifest)+',\n];\nexport const foundationMigration');save(name,s.encode())
for name in ['css/screens.css','js/screens/checkin.js','js/screens/profile.js']:
 relative='BNBU-Sports-Web-new/frontend/student/'+name
 old=subprocess.check_output(['git','show','HEAD:'+relative],cwd=ROOT).decode().splitlines(True)
 new=(ROOT/relative).read_text(encoding='utf-8').splitlines(True)
 baseline=(work/'student'/name).read_text(encoding='utf-8')
 for group in difflib.SequenceMatcher(None,old,new,autojunk=False).get_grouped_opcodes(3):
  first,last=group[0],group[-1];before=''.join(old[first[1]:last[2]]);after=''.join(new[first[3]:last[4]])
  assert baseline.count(before)==1,('Static baseline mismatch',name,before[:100]);baseline=baseline.replace(before,after,1)
 p=bundle/'web/student'/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(baseline,encoding='utf-8',newline='\n')
 web.append({'path':name,'before':sha(work/'student'/name),'after':sha(p)})
migrations=bundle/'migrator/prisma/migrations';migrations.mkdir(parents=True,exist_ok=True)
shutil.copytree(ROOT/'backend/prisma/migrations/0088_student_self_erasure',migrations/'0088_student_self_erasure',dirs_exist_ok=True)
# Validation uses the whole production runtime with only these files overlaid.
candidate=work/'candidate';shutil.copytree(work/'dist',candidate/'dist',dirs_exist_ok=True)
shutil.copytree(bundle/'backend/dist',candidate/'dist',dirs_exist_ok=True)
(candidate/'package.json').write_text('{"type":"module"}\n')
(bundle/'backend/Dockerfile').write_text('FROM bnbu-backend-account-goals-base:20260920\nCOPY --chown=10001:10001 dist/ /app/dist/\n')
(bundle/'migrator/Dockerfile').write_text('FROM bnbu-migrator-account-goals-base:20260920\nCOPY --chown=10001:10001 prisma/migrations/ /app/prisma/migrations/\n')
gate={'release':'browser-access-four-20260920','baseBackend':'sha256:29d8612b0e63e4adc2820dd4027f7e905f8fa9b0c894a4f262b67c33166c8a8b','delta':delta,'web':web}
(bundle/'validation.json').write_text(json.dumps(gate,indent=2))
print(json.dumps({'result':'PACKAGED','backendFiles':len(delta),'studentFiles':len(web),'migration':'0088_student_self_erasure'}))
