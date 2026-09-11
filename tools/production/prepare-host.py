#!/usr/bin/env python3
"""Run as root on the HK CVM. Creates initial secrets once; never prints values."""
import base64
import json
import os
from pathlib import Path
import secrets
import subprocess
from urllib.parse import quote

assert os.geteuid() == 0
runtime_logs = Path('/var/lib/bnbu-sports-production/runtime-logs')
runtime_logs.mkdir(parents=True, exist_ok=True, mode=0o750)
os.chown(runtime_logs, 10001, 10001)
os.chmod(runtime_logs, 0o750)
root = Path('/etc/bnbu-sports-production')
secret_dir = root / 'secrets'
secret_dir.mkdir(parents=True, exist_ok=True, mode=0o750)
os.chown(secret_dir, 0, 10001)

def write_once(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o640)
    with os.fdopen(fd, 'w') as output:
        output.write(value)
    os.chown(path, 0, 10001)

def database_url(user):
    # libpq escaping is supported, including escaped colons and backslashes.
    for line in Path('/home/ubuntu/.pgpass').read_text().splitlines():
        if not line or line.startswith('#'):
            continue
        fields, field, escaped = [], '', False
        for char in line:
            if escaped:
                field += char
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == ':':
                fields.append(field)
                field = ''
            else:
                field += char
        fields.append(field)
        if len(fields) == 5 and fields[0] in ('172.19.0.16', '*') and fields[2] in ('bnbusports', '*') and fields[3] == user:
            return 'postgresql://' + user + ':' + quote(fields[4], safe='') + '@172.19.0.16:5432/bnbusports?schema=public'
    raise RuntimeError('Required database account missing from server pgpass')

runtime = secret_dir / 'runtime.json'
if not runtime.exists():
    private = subprocess.check_output(['openssl', 'genpkey', '-algorithm', 'ED25519'])
    public = subprocess.check_output(['openssl', 'pkey', '-pubout'], input=private)
    values = {key: base64.b64encode(secrets.token_bytes(32)).decode() for key in (
        'IDEMPOTENCY_ENCRYPTION_KEY', 'SECURITY_HASH_KEY', 'QR_JOIN_TOKEN_HASH_KEY',
        'QR_JOIN_SECRET_ENCRYPTION_KEY', 'PUSH_TOKEN_ENCRYPTION_KEY')}
    values.update(DATABASE_URL=database_url('bnbusports_app'), TOKEN_SIGNING_KEY=private.decode(), TOKEN_VERIFYING_KEY=public.decode())
    write_once(runtime, json.dumps(values))
if not (secret_dir / 'migrator.json').exists():
    write_once(secret_dir / 'migrator.json', json.dumps({'MIGRATION_DATABASE_URL': database_url('bnbusports_sqladmin')}))
ca = secret_dir / 'tencentdb-ca-chain.pem'
if not ca.exists():
    write_once(ca, Path('/etc/bnbu-sports-staging/secrets/tencentdb-ca-chain.pem').read_text())
print('Production secret files ready; existing values preserved; root:10001 mode 0640.')
