#!/usr/bin/env python3
"""Configure private socket scanning; preserve the first installed configuration."""
from pathlib import Path
import shutil
import subprocess

config = Path('/etc/clamav/clamd.conf')
backup = config.with_suffix('.conf.before-bnbu-production')
if not backup.exists():
    shutil.copy2(config, backup)
settings = {
    'LocalSocketGroup': 'bnbu-secrets', 'LocalSocketMode': '660',
    'MaxThreads': '2', 'MaxQueue': '4', 'StreamMaxLength': '512M',
    'MaxFileSize': '512M', 'MaxScanSize': '600M',
    'AlertExceedsMax': 'true', 'ConcurrentDatabaseReload': 'false',
}
lines = [line for line in config.read_text().splitlines() if not line.split(' ', 1)[0] in settings]
config.write_text('\n'.join(lines + [key + ' ' + value for key, value in settings.items()]) + '\n')
dropin = Path('/etc/systemd/system/clamav-daemon.socket.d')
dropin.mkdir(exist_ok=True)
(dropin / 'bnbu-production.conf').write_text('[Socket]\nSocketGroup=bnbu-secrets\nSocketMode=0660\n')
subprocess.run(['systemctl', 'daemon-reload'], check=True)
subprocess.run(['systemctl', 'enable', '--now', 'clamav-daemon.socket', 'clamav-daemon.service', 'clamav-freshclam.service'], check=True)
print('Private scanner enabled with bounded concurrency and size limits.')
