"""Create a private, non-overwriting production backup before the approved release."""
import datetime
import json
import os
import pathlib
import subprocess
import urllib.parse

if os.geteuid() != 0:
    raise SystemExit("Run as root on the production host")
root = pathlib.Path('/opt/bnbu-sports-production/backups').resolve(strict=True)
secrets = json.loads(pathlib.Path('/etc/bnbu-sports-production/secrets/migrator.json').read_text())
database = urllib.parse.urlsplit(secrets['MIGRATION_DATABASE_URL'])
if database.hostname != '172.19.0.16' or database.path != '/bnbusports':
    raise SystemExit('Unexpected production database target')
target = root / ('before-bugfix-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '.dump')
environment = dict(os.environ, PGHOST=database.hostname, PGPORT=str(database.port or 5432),
    PGDATABASE='bnbusports', PGUSER=urllib.parse.unquote(database.username),
    PGPASSWORD=urllib.parse.unquote(database.password), PGSSLMODE='verify-full',
    PGSSLROOTCERT='/etc/bnbu-sports-production/secrets/tencentdb-ca-chain.pem')
descriptor = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
with os.fdopen(descriptor, 'wb') as output:
    result = subprocess.run(['pg_dump', '--format=custom', '--no-owner', '--no-acl'],
        env=environment, stdout=output, stderr=subprocess.PIPE)
if result.returncode != 0:
    raise SystemExit('Backup failed; partial file retained privately for diagnosis')
verified = subprocess.run(['pg_restore', '--list', str(target)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
if verified.returncode != 0 or target.stat().st_size == 0:
    raise SystemExit('Backup catalog verification failed')
print(json.dumps({'check':'PRE_RELEASE_DATABASE_BACKUP','result':'PASS','path':str(target),'bytes':target.stat().st_size}))
