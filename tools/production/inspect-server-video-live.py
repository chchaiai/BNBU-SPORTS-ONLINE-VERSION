"""Read-only post-release checks; emit aggregates without customer details."""
import collections
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import urllib.parse
import urllib.request

work = Path('/home/ubuntu/bnbu-server-video-20260915')
release = Path('/opt/bnbu-sports-production/current').resolve()
assert release == Path('/opt/bnbu-sports-production/releases/server-video-20260915')
deployment = json.loads((work / 'deployment.json').read_text())
backend = json.loads(subprocess.check_output(['docker','inspect','bnbu-sports-production-backend-1']))[0]
assert backend['Image'] == deployment['image']
assert backend['State']['Health']['Status'] == 'healthy' and not backend['State']['OOMKilled']
with urllib.request.urlopen('https://www.student.bnbusports.cn/api/v1/health/ready',timeout=30) as response:
    assert response.status == 200
with urllib.request.urlopen('https://www.student.bnbusports.cn/student/js/video-source.js?verify=postdeploy',timeout=30) as response:
    cache = response.headers.get('Cache-Control')
    digest = hashlib.sha256(response.read()).hexdigest()
assert digest == json.loads((work/'validation.json').read_text())['files']['web/student/js/video-source.js']

secrets = json.loads(Path('/etc/bnbu-sports-production/secrets/migrator.json').read_text())
database = urllib.parse.urlsplit(secrets['MIGRATION_DATABASE_URL'])
assert database.hostname == '172.19.0.16' and database.path == '/bnbusports'
env = dict(os.environ, PGHOST=database.hostname, PGPORT=str(database.port or 5432), PGDATABASE='bnbusports',
    PGUSER=urllib.parse.unquote(database.username), PGPASSWORD=urllib.parse.unquote(database.password),
    PGSSLMODE='verify-full', PGSSLROOTCERT='/etc/bnbu-sports-production/secrets/tencentdb-ca-chain.pem')
sql = """SELECT json_build_object(
 'migrationApplied',EXISTS(SELECT 1 FROM _prisma_migrations WHERE migration_name='0079_server_video_normalization' AND finished_at IS NOT NULL AND rolled_back_at IS NULL),
 'newVideoStates',COALESCE((SELECT json_object_agg(upload_status,n) FROM
   (SELECT upload_status,count(*) n FROM media_evidence WHERE safe_metadata->>'videoPipeline'='1' GROUP BY upload_status) s),'{}'::json));"""
facts = json.loads(subprocess.check_output(['psql','-X','-A','-t','-v','ON_ERROR_STOP=1','-c',sql],env=env,text=True))
assert facts['migrationApplied']
logs = subprocess.run(['docker','logs','--since',backend['State']['StartedAt'],'bnbu-sports-production-backend-1'],capture_output=True,text=True,check=True)
levels = collections.Counter()
for line in (logs.stdout + '\n' + logs.stderr).splitlines():
    try:
        item = json.loads(line)
        if isinstance(item,dict): levels[str(item.get('level','unspecified'))] += 1
    except json.JSONDecodeError:
        pass
result = {'result':'PASS','checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'release':str(release),
    'backendStartedAt':backend['State']['StartedAt'],'healthy':True,'oomKilled':False,'restartCount':backend['RestartCount'],
    'videoSourceCacheControl':cache,'videoSourceHash':'PASS','database':facts,'logLevels':dict(levels),
    'scope':'Read-only service and migration checks; video states are aggregates, not phone acceptance'}
(work/'postdeploy.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result))
