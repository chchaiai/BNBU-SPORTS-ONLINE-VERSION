"""Read-only production preflight for the credit projection constraint repair."""
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import urlsplit, unquote

assert os.geteuid() == 0
base = Path('/opt/bnbu-sports-production')
current = (base / 'current').resolve(strict=True)
assert current.is_relative_to(base / 'releases')
database = urlsplit(json.loads(Path('/etc/bnbu-sports-production/secrets/migrator.json').read_text())['MIGRATION_DATABASE_URL'])
assert database.hostname == '172.19.0.16' and database.path == '/bnbusports'
environment = dict(os.environ, PGHOST=database.hostname, PGPORT=str(database.port or 5432),
    PGDATABASE='bnbusports', PGUSER=unquote(database.username), PGPASSWORD=unquote(database.password),
    PGSSLMODE='verify-full', PGSSLROOTCERT='/etc/bnbu-sports-production/secrets/tencentdb-ca-chain.pem',
    PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=1000')
sql = """
SELECT json_build_object(
 'observedAt',now(),
 'constraints',(SELECT json_agg(json_build_object('name',conname,'definition',pg_get_constraintdef(oid),'validated',convalidated)) FROM pg_constraint WHERE conrelid='v81_credit_projections'::regclass),
 'projectionRows',(SELECT count(*) FROM v81_credit_projections),
 'affectedRecords',(SELECT json_agg(row_to_json(x)) FROM (
   SELECT r.id,r.actual_duration_seconds,s.maximum_minutes,w.stage,w.version
   FROM exercise_records r JOIN v81_record_rule_snapshots s ON s.record_id=r.id
   JOIN v81_record_workflows w ON w.record_id=r.id
   WHERE r.id IN ('01a09d8e-0982-7398-9c44-946d27f9616b','01a09d89-c8fa-754f-aa16-c659f1a0f0f8')) x),
 'migrations',(SELECT json_agg(row_to_json(x)) FROM (
   SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY migration_name) x)
);
"""
result = subprocess.run(['psql','-X','-A','-t','-v','ON_ERROR_STOP=1'], input=sql, text=True,
    capture_output=True, env=environment, timeout=20)
if result.returncode:
    raise SystemExit('Read-only database preflight failed')
report = json.loads(result.stdout)
report['current'] = str(current)
images = dict(line.split('=',1) for line in (current / '.env').read_text().splitlines() if line.startswith(('BACKEND_IMAGE=','PORTAL_IMAGE=','MIGRATOR_IMAGE=')))
report['images'] = images
report['imageIds'] = {key:subprocess.check_output(['docker','image','inspect','--format','{{.Id}}',tag],text=True).strip() for key,tag in images.items()}
report['runtime'] = {service:subprocess.check_output(['docker','inspect','--format','{{.Id}} {{.Image}} {{.State.StartedAt}} {{.State.Health.Status}}','bnbu-sports-production-'+service+'-1'],text=True).strip() for service in ['backend','portal']}
report['backendFiles'] = subprocess.check_output(['docker','exec','bnbu-sports-production-backend-1','sha256sum',
    '/app/dist/modules/v8/v81-credit-store.js','/app/dist/modules/v8/domain/crediting.js','/app/dist/modules/v8/v81.service.js'],text=True).splitlines()
print(json.dumps(report,indent=2))
