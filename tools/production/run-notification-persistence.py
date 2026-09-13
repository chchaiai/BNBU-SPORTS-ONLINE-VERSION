import json,subprocess
from pathlib import Path
from urllib.parse import quote
root=Path(__file__).resolve().parents[2]
backend='bnbu-v81-local-validation-backend-browser-1'
postgres='bnbu-v81-full-integration-integration-postgres-1'
def capture(args):return subprocess.check_output(args,text=True).strip()
def networks(name):return json.loads(capture(['docker','inspect','--format','{{json .NetworkSettings.Networks}}',name]))
pg_networks=networks(postgres);assert len(pg_networks)==1
network=next(iter(pg_networks));host=pg_networks[network]['IPAddress'];assert host
image=capture(['docker','inspect','--format','{{.Image}}',backend])
values={key:capture(['docker','exec',postgres,'printenv',key]) for key in ['POSTGRES_USER','POSTGRES_PASSWORD','POSTGRES_DB']}
url='postgresql://'+quote(values['POSTGRES_USER'],safe='')+':'+quote(values['POSTGRES_PASSWORD'],safe='')+'@'+host+':5432/'+quote(values['POSTGRES_DB'],safe='')
result=subprocess.run(['docker','run','--rm','--network',network,'--read-only','--tmpfs','/tmp','--cap-drop','ALL','--security-opt','no-new-privileges','-e','PROBE_DATABASE_URL='+url,'-e','PROBE_EXPECTED_HOST='+host,'-v',str(root/'.local/notification-persistence-probe.mjs')+':/workspace/backend/notification-persistence-probe.mjs:ro','-v',str(root/'backend/prisma/migrations/0076_notification_review_content/migration.sql')+':/workspace/backend/notification-migration.sql:ro','--entrypoint','node',image,'/workspace/backend/notification-persistence-probe.mjs'],text=True,capture_output=True)
if result.returncode:raise RuntimeError(result.stderr.replace(url,'[redacted database URL]'))
evidence=json.loads(result.stdout);(root/'evidence/ocr-triplatform-20260913/notification-persistence-postgres.json').write_text(json.dumps(evidence,indent=2)+'\n',encoding='utf-8');print(json.dumps(evidence))
