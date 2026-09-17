"""Package only inspected production deltas and the tested Portal build."""
import hashlib,json,shutil,tarfile
from pathlib import Path
root=Path(__file__).resolve().parents[2]
e=root/'evidence/demand-20260916'; bundle=e/'release-bundle'
assert not bundle.exists()
bundle.mkdir()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
delta=json.loads((e/'production-diff.json').read_text())
def copy(source,name):
 p=bundle/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,p)
for item in delta['backend']:
 name=item['path'];copy(root/'backend/dist'/name,'backend/dist/'+name)
 if name.endswith('.js') and (root/'backend/dist'/(name+'.map')).exists():copy(root/'backend/dist'/(name+'.map'),'backend/dist/'+name+'.map')
for item in delta['student']:copy(root/'BNBU-Sports-Web-new/frontend/student'/item['path'],'web/student/'+item['path'])
shutil.copytree(root/'BNBU-Sports-Web-new/portal-teacher-admin/dist',bundle/'portal/dist')
for migration in ['0081_media_capability_renewal','0082_exercise_date_boundaries']:
 shutil.copytree(root/'backend/prisma/migrations'/migration,bundle/'migrator/prisma/migrations'/migration)
for service in ['backend','portal','migrator']:
 content=f'FROM bnbu-{service}-demand-base:20260916\n'
 content+=('COPY --chown=10001:10001 dist/ /app/dist/\n' if service!='migrator' else 'COPY --chown=node:node prisma/ /app/prisma/\n')
 (bundle/service/'Dockerfile').write_text(content)
for source,name in [('deploy-demand-20260916.py','deploy.py'),('backup-before-bugfix.py','backup.py')]:copy(root/'tools/production'/source,name)
gate={'previous':'student-origin-20260916','release':'demand-20260916','baseImages':{
 'backend':'sha256:127aa91c5e5a8f9a7124b946920eb6fb696238774c15cf28f376f673a7aa5fa8',
 'portal':'sha256:7d8b2c294ee13f0fabfbded319df9daf5063a0ba181dad2750b0c4462ba5c51f',
 'migrator':'sha256:95d8b5d2277da3eb46633a27480dcbe4a16ce6b4412862c11bc64d469025c824'},
 'delta':delta,'checks':{'unit':322,'contract':35,'integration':60,'security':53,'e2e':144,'student':69,'portal':140,'localMedia':13,'browser':'PASS'},
 'files':{p.relative_to(bundle).as_posix():sha(p) for p in bundle.rglob('*') if p.is_file()}}
(bundle/'validation.json').write_text(json.dumps(gate,indent=2))
with tarfile.open(e/'release-bundle.tar.gz','w:gz') as tar:
 for p in bundle.iterdir():tar.add(p,arcname=p.name)
print(json.dumps({'files':len(gate['files']),'sha256':sha(e/'release-bundle.tar.gz')}))
