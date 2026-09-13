"""Bounded portal-only rollback drill, always restore the starting release."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request

assert os.geteuid() == 0
base = Path('/opt/bnbu-sports-production')
current = base / 'releases/invite-ui-final-20260913'
previous = base / 'releases/invite-brand-20260913'
assert (base / 'current').resolve() == current
for name in ['production.env', 'compose.yml', 'nginx.conf']:
    assert (current / name).read_bytes() == (previous / name).read_bytes()

def output(args):
    return subprocess.check_output(args, text=True).strip()

def inspect(container, expression):
    return output(['docker', 'inspect', '--format', expression, container])

portal = 'bnbu-sports-production-portal-1'
backend = 'bnbu-sports-production-backend-1'
initial_portal = inspect(portal, '{{.Image}}')
initial_backend = inspect(backend, '{{.Id}} {{.Image}} {{.State.StartedAt}}')
assert initial_portal == 'sha256:69c42e30e571a3af217b1b733d258be611a841744b254e0d454a2ea34f546e10'
assert inspect(backend, '{{.Image}}') == 'sha256:c676a33218fc069cc6c57a14d36a96420bfeb8bb36facb84939cff8826b68055'
assert output(['docker', 'image', 'inspect', '--format', '{{.Id}}', 'bnbu-portal-production:invite-brand-20260913']) == 'sha256:182a9d232c395fae913021f9182aabc8d1ab93c3f1265b7204d9773189b43ced'
assert (current / 'web/runtime-config.js').read_bytes() == (previous / 'web/runtime-config.js').read_bytes()
def tree_hash(root):
    return {str(Path(folder, name).relative_to(root)): hashlib.sha256(Path(folder, name).read_bytes()).hexdigest() for folder, _, names in os.walk(root, followlinks=True) for name in names}
current_web = tree_hash(current / 'web')
assert current_web and current_web == tree_hash(previous / 'web')
steps = []

def activate(target):
    subprocess.run(['docker', 'compose', '--project-directory', str(target), 'up', '-d', '--no-build', '--pull', 'never', '--no-deps', 'portal'], check=True)
    for _ in range(45):
        if inspect(portal, '{{.State.Health.Status}}') == 'healthy':
            break
        time.sleep(1)
    else:
        raise RuntimeError('Portal health timeout')
    link = base / 'rollback-drill-current-tmp'
    assert not link.exists() and not link.is_symlink()
    link.symlink_to(target)
    os.replace(link, base / 'current')
    statuses = []
    for url in ['https://www.teacher.bnbusports.cn/', 'https://www.student.bnbusports.cn/student/', 'https://www.student.bnbusports.cn/api/v1/health/ready']:
        with urllib.request.urlopen(url, timeout=15) as response:
            assert response.status == 200
            statuses.append({'url': url, 'status': response.status})
    assert inspect(backend, '{{.Id}} {{.Image}} {{.State.StartedAt}}') == initial_backend
    steps.append({'release': target.name, 'portalImage': inspect(portal, '{{.Image}}'), 'health': 'healthy', 'publicChecks': statuses, 'backendUnchanged': True})

try:
    activate(previous)
    assert steps[-1]['portalImage'] != initial_portal
finally:
    activate(current)
    assert inspect(portal, '{{.Image}}') == initial_portal
    assert (base / 'current').resolve() == current

print(json.dumps({'check': 'FINAL_PORTAL_ROLLBACK_AND_RESTORE', 'observedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'steps': steps, 'restored': True, 'limitations': 'Portal-only drill; backend and database rollback not exercised.'}))
