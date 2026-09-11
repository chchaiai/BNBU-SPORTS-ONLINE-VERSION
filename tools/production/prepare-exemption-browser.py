"""Reopen the existing isolated fixture and prepare its endurance-test profile."""
import os
from pathlib import Path
import subprocess

if os.geteuid() != 0:
    raise SystemExit('Run on the intended host as root')
work = Path('/home/ubuntu/bnbu-bugfix-round2-20260910')
for script in ['reopen-round2-display-acceptance.mjs', 'prepare-exemption-profile.mjs']:
    subprocess.run([
        'docker', 'run', '--rm', '--network', 'host', '--read-only', '--tmpfs', '/tmp',
        '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '10001:10001',
        '--group-add', '10001', '--env-file', '/opt/bnbu-sports-production/current/production.env',
        '--env-file', '/etc/bnbu-sports-production/mail.env',
        '-v', '/etc/bnbu-sports-production/secrets/runtime.json:/run/secrets/runtime.json:ro',
        '-v', '/etc/bnbu-sports-production/secrets/tencentdb-ca-chain.pem:/run/secrets/tencentdb-ca-chain.pem:ro',
        '-v', str(work / 'long-acceptance') + ':/acceptance',
        '-v', str(work / script) + ':/app/' + script + ':ro',
        '--entrypoint', 'node', 'bnbu-backend-production:27f9f25a-round2', '/app/' + script,
    ], check=True)
subprocess.run(['install', '-o', 'ubuntu', '-g', 'ubuntu', '-m', '600',
                str(work / 'long-acceptance/long-checkin.json'),
                str(work / 'long-checkin-private.json')], check=True)
