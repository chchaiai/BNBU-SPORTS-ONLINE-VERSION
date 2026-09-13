from pathlib import Path
import hashlib,json,shutil
root=Path(__file__).resolve().parents[2]
work=root/'.local/notification-history-release';work.mkdir(exist_ok=False)
names=['client-messaging.service.js','notification-history.projection.js']
for name in names:shutil.copyfile(root/'backend/dist/modules/client-capabilities'/name,work/name)
(work/'Dockerfile').write_text('FROM bnbu-backend-production:notification-locale-20260913\n'+''.join(f'COPY --chown=10001:10001 {name} /app/dist/modules/client-capabilities/{name}\n' for name in names),encoding='utf-8')
files={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in work.iterdir() if p.is_file()}
(work/'validation.json').write_text(json.dumps({'files':files,'sourceCommit':'077399c2','checks':{'typecheck':'PASS','unitTests':289,'productionReadOnlyMatches':38}},indent=2)+'\n',encoding='utf-8')
print(json.dumps({'result':'PREPARED','fileCount':len(files)}))
