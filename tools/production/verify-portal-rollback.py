"""Bounded portal-only rollback drill, always restore the starting release."""
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request

assert os.geteuid() == 0
base = Path('/opt/bnbu-sports-production')
current = base / 'releases/portal-required-20260913'
previous = base / 'releases/submit-atomic-20260913'
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
assert initial_portal == 'sha256:b2911babf4c1562cb9a2250ead08effc96e2cd6cf30ce9ca78dd717132e61c56'
steps = []

def activate(target):
    subprocess.run(['docker', 'compose', '--project-directory', str(target), 'up', '-d', '--no-build', '--pull', 'never', 'portal'], check=True)
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

print(json.dumps({'check': 'LIVE_PORTAL_ROLLBACK_AND_RESTORE', 'observedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'steps': steps, 'restored': True, 'limitations': 'Portal-only drill; backend and database rollback not exercised.'}))
