"""Deploy a fully validated round2 release, retaining an automatic rollback."""
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import tarfile
import time
import urllib.request

if os.geteuid() != 0:
    raise SystemExit('Run as root on the intended production host')
work = pathlib.Path('/home/ubuntu/bnbu-bugfix-round2-20260910')
base = pathlib.Path('/opt/bnbu-sports-production')
gate = json.loads((work / 'local-validation.json').read_text())
commit = gate.get('sourceCommit', '')
if len(commit) != 40 or any(c not in '0123456789abcdef' for c in commit):
    raise SystemExit('A full source commit is required')
release = base / ('releases/' + commit[:12] + '-round2')
previous = base / 'releases/b83b302c-bugfix2'
nginx = pathlib.Path('/etc/nginx/sites-available/bnbu-staging-hk.conf')
gate = json.loads((work / 'local-validation.json').read_text())
if gate.get('status') != 'PASS' or gate.get('real30MinuteSubmission') != 'PASS' or any(gate.get('bugs', {}).get('BUG-%02d' % number) != 'PASS' for number in range(1, 8)):
    raise SystemExit('Local validation gate is not satisfied')
if gate.get('migrations') != ['0060_subadmin_contact_email_scope'] or gate.get('sharedEmailIdentityIsolation') != 'PASS':
    raise SystemExit('Shared-email migration and identity-isolation gate is not satisfied')
if (base / 'current').resolve() != previous or release.exists():
    raise SystemExit('Unexpected current release or existing destination; inspect before continuing')
for name in ['release.tar.gz', 'bugfix-release-images.tar.gz']:
    with (work / name).open('rb') as source:
        digest = hashlib.file_digest(source, 'sha256').hexdigest() if hasattr(hashlib, 'file_digest') else None
    if digest is None:
        value = hashlib.sha256()
        with (work / name).open('rb') as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b''):
                value.update(chunk)
        digest = value.hexdigest()
    if digest != gate['artifacts'][name]:
        raise SystemExit('Release archive checksum mismatch')
if hashlib.sha256(nginx.read_bytes()).hexdigest() != gate['previousNginxSha256']:
    raise SystemExit('Nginx changed since inspection; preserve and reconcile it')

def run(args):
    subprocess.run(args, check=True)

run(['python3', str(work / 'backup-before-bugfix.py')])
run(['docker', 'load', '-i', str(work / 'bugfix-release-images.tar.gz')])
release.mkdir(mode=0o755)
with tarfile.open(work / 'release.tar.gz', 'r:gz') as archive:
    for member in archive.getmembers():
        target = (release / member.name).resolve()
        if not target.is_relative_to(release) or not (member.isfile() or member.isdir()):
            raise SystemExit('Unexpected archive member')
    archive.extractall(release)
release.chmod(0o755)
for target in release.rglob('*'):
    target.chmod(0o755 if target.is_dir() else 0o644)
logs = pathlib.Path('/var/lib/bnbu-sports-production/runtime-logs')
logs.mkdir(mode=0o750, parents=True, exist_ok=True)
os.chown(logs, 10001, 10001)
logs.chmod(0o750)
nginx_backup = base / 'backups/nginx-before-bugfix-round2-20260910.conf'
with nginx_backup.open('xb') as output:
    output.write(nginx.read_bytes())
nginx_backup.chmod(0o600)

def switch_current(target):
    temporary = base / 'current-bugfix-round2-tmp'
    if temporary.exists() or temporary.is_symlink():
        raise RuntimeError('Unexpected temporary release link')
    temporary.symlink_to(target)
    os.replace(temporary, base / 'current')

try:
    # Quiesce writes while the contact-email scope is migrated atomically.
    # Rollback retains this compatible extension and all user data; it does not
    # recreate the old unique index, which would reject approved shared emails.
    run(['docker', 'compose', '--project-directory', str(previous), 'stop', 'backend'])
    run(['docker', 'compose', '--project-directory', str(release), '--profile', 'migration', 'run', '--rm', '--no-deps', 'migrator'])
    run(['docker', 'compose', '--project-directory', str(release), 'up', '-d', '--no-build', '--pull', 'never', 'backend', 'portal'])
    healthy = False
    for attempt in range(90):
        statuses = [subprocess.check_output(['docker', 'inspect', '--format', '{{.State.Health.Status}}', 'bnbu-sports-production-' + service + '-1'], text=True).strip() for service in ['backend', 'portal']]
        if statuses == ['healthy', 'healthy']:
            healthy = True
            break
        time.sleep(1)
    if not healthy:
        raise RuntimeError('New containers failed health checks')
    switch_current(release)
    shutil.copyfile(release / 'nginx.conf', nginx)
    run(['nginx', '-t'])
    run(['systemctl', 'reload', 'nginx'])
    for url in ['https://www.student.bnbusports.cn/api/v1/health/ready', 'https://www.teacher.bnbusports.cn/api/v1/health/ready', 'https://www.student.bnbusports.cn/runtime-config.js', 'https://www.student.bnbusports.cn/student/', 'https://www.teacher.bnbusports.cn/']:
        for attempt in range(15):
            try:
                with urllib.request.urlopen(url, timeout=20) as response:
                    if response.status != 200:
                        raise RuntimeError('Public release health failed')
                print(json.dumps({'check': 'PUBLIC_URL', 'url': url, 'result': 'PASS'}), flush=True)
                break
            except Exception:
                if attempt == 14:
                    print(json.dumps({'check': 'PUBLIC_URL', 'url': url, 'result': 'FAIL'}), flush=True)
                    raise
                time.sleep(1)
    print(json.dumps({'check': 'PRODUCTION_DEPLOYMENT_PUBLIC_HEALTH', 'result': 'PASS', 'release': str(release), 'previous': str(previous)}))
except Exception:
    shutil.copyfile(nginx_backup, nginx)
    if (base / 'current').resolve() != previous:
        switch_current(previous)
    run(['docker', 'compose', '--project-directory', str(previous), 'up', '-d', '--no-build', '--pull', 'never', 'backend', 'portal'])
    run(['nginx', '-t'])
    run(['systemctl', 'reload', 'nginx'])
    print(json.dumps({'check': 'PRODUCTION_DEPLOYMENT', 'result': 'FAILED_ROLLED_BACK', 'release': str(previous)}))
    raise
