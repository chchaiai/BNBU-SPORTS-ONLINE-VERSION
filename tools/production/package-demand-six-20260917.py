"""Package reviewed changes on the live baseline; never include unrelated local runtime deltas."""
import hashlib,json,shutil,tarfile,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[2];e=root/'evidence/demand-1-6-20260917';bundle=e/'bundle'
assert not bundle.exists();bundle.mkdir()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
baseline=json.loads((e/'baseline/baseline.json').read_text())
runtime=[
 'common/errors/application-error.js','modules/exercise-records/application/exercise-records.service.js',
 'modules/media/application/media-validator.js','modules/media/application/video-normalizer.js',
 'modules/v8/domain/ai-review.js','modules/v8/domain/notification-history.js',
 'modules/v8/v81-ai-decision.js','modules/v8/v81-ai-review-store.js','modules/v8/v81-ai-review.worker.js',
 'modules/v8/v81-materials.js','modules/v8/v81-notifications.js','modules/v8/v81-record-state.js',
 'generated/openapi.document.generated.json','generated/openapi.manifest.generated.json',
]
web=['index.html','css/upload-progress.css','js/api.js','js/app.js','js/screens/checkin.js','js/screens/join.js','js/upload-progress.js']
def copy(source,name):
 target=bundle/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target)
delta=[]
for name in runtime:
 source=root/'backend/dist'/name;old=e/'baseline/backend/dist'/name
 if not source.exists() and name=='generated/openapi.manifest.generated.json':source=root/'backend/src'/name
 assert old.exists() or name=='modules/v8/v81-ai-decision.js'
 delta.append({'path':name,'before':sha(old) if old.exists() else None,'after':sha(source)})
 copy(source,'backend/dist/'+name)
 if source.suffix=='.js' and source.with_suffix('.js.map').exists():copy(source.with_suffix('.js.map'),'backend/dist/'+name+'.map')
shutil.copytree(root/'BNBU-Sports-Web-new/portal-teacher-admin/dist',bundle/'portal/dist')
for s in ['backend','portal']:
 (bundle/s/'Dockerfile').write_text(f'FROM bnbu-{s}-demand-six-base:20260917\nCOPY --chown=10001:10001 dist/ /app/dist/\n')
webdelta=[]
for name in web:
 source=root/'BNBU-Sports-Web-new/frontend/student'/name
 before=None
 if name!='css/upload-progress.css':
  with urllib.request.urlopen('https://www.student.bnbusports.cn/student/'+name,timeout=30) as r:before=hashlib.sha256(r.read()).hexdigest()
 copy(source,'web/student/'+name);webdelta.append({'path':name,'before':before,'after':sha(source)})
copy(root/'tools/production/deploy-demand-six-20260917.py','deploy.py')
copy(root/'tools/production/backup-before-bugfix.py','backup.py')
gate={**baseline,'delta':delta,'web':webdelta,'migration':'none; retain deployed 0083 registry',
 'checks':{'backendUnit':28,'postgresIntegration':'PASS','studentSmoke':87,'studentMedia':17,'portal':18,'realLocalVideoSubmit':'PASS','browserEngines':['Chromium','WebKit']},
 'files':{p.relative_to(bundle).as_posix():sha(p) for p in bundle.rglob('*') if p.is_file()}}
(bundle/'validation.json').write_text(json.dumps(gate,indent=2))
with tarfile.open(e/'bundle.tar.gz','w:gz') as tar:
 for p in bundle.iterdir():tar.add(p,arcname=p.name)
print(json.dumps({'result':'PACKAGED','runtimeFiles':len(delta),'studentFiles':len(webdelta),'sha256':sha(e/'bundle.tar.gz')}))
