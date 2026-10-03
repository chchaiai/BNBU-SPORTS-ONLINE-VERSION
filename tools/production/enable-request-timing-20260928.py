"""Install privacy-preserving request timings with checked, conditional rollback."""
import hashlib
import http.client
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time

MAIN = Path('/etc/nginx/nginx.conf')
SPORTS = Path('/etc/nginx/sites-available/bnbu-staging-hk.conf')
BACKUP = Path('/opt/bnbu-sports-production/backups/request-timing-20260928')
LOG = Path('/var/log/nginx/request-timing.log')
FILES = (MAIN, SPORTS)
FORMAT = r'''
    # Request timing: exclude URLs, queries, IPs, headers and user identifiers.
    map $uri $bnbu_route_group {
        default page;
        ~^/api/v1/health/ health;
        ~^/api/ api;
        ~^/student/ student;
        ~^/assets/ asset;
        ~^/_next/static/ asset;
    }
    log_format bnbu_timing escape=json
        '{"time":"$time_iso8601","host":"$server_name","group":"$bnbu_route_group",'
        '"method":"$request_method","status":$status,"bytes":$body_bytes_sent,'
        '"request_time":$request_time,"upstream_connect":"$upstream_connect_time",'
        '"upstream_header":"$upstream_header_time","upstream_response":"$upstream_response_time",'
        '"protocol":"$server_protocol","connection_requests":$connection_requests}';
    access_log /var/log/nginx/request-timing.log bnbu_timing buffer=32k flush=5s;
'''


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def candidate(main, sports):
    assert 'bnbu_timing' not in main and 'bnbu_timing' not in sports
    anchor = '\taccess_log /var/log/nginx/access.log;'
    assert main.count(anchor) == 1
    assert sports.count('access_log off;') == 3
    return (main.replace(anchor, FORMAT + '\n' + anchor),
            sports.replace('access_log off;',
                           'access_log /var/log/nginx/request-timing.log bnbu_timing buffer=32k flush=5s;'))


def reload():
    run('nginx', '-t')
    run('systemctl', 'reload', 'nginx')
    time.sleep(2)


def restore():
    for path in FILES:
        shutil.copy2(BACKUP / path.name, path)
    reload()


class LocalHTTPS(http.client.HTTPSConnection):
    def connect(self):
        self.sock = self._context.wrap_socket(
            socket.create_connection(('127.0.0.1', 443), 10), server_hostname=self.host)


def verify():
    checks = []
    for host, path in [('www.student.bnbusports.cn', '/student/'),
                       ('www.teacher.bnbusports.cn', '/'),
                       ('verityai.cn', '/'), ('knowledge.verityai.cn', '/'),
                       ('www.student.bnbusports.cn', '/api/v1/health/ready'),
                       ('www.teacher.bnbusports.cn', '/api/v1/health/ready')]:
        c = LocalHTTPS(host, timeout=10)
        start = time.monotonic()
        c.request('GET', path)
        response = c.getresponse()
        response.read()
        c.close()
        assert response.status == 200, (host, path, response.status)
        checks.append({'host': host, 'path': path, 'status': response.status,
                       'seconds': round(time.monotonic() - start, 4)})
    time.sleep(6)
    with LOG.open('rb') as stream:
        stream.seek(max(0, LOG.stat().st_size - 262144))
        data = stream.read().splitlines()[1:]
    rows = [json.loads(line) for line in data]
    for host in ('www.student.bnbusports.cn', 'www.teacher.bnbusports.cn'):
        assert any(row['host'] == host and row['group'] == 'health'
                   and row['upstream_response'] != '-' for row in rows), host
    return checks


def main():
    assert sys.argv[1:] in (['--apply'], ['--rollback']) and os.geteuid() == 0
    if sys.argv[1] == '--rollback':
        installed = json.loads((BACKUP / 'installed-hashes.json').read_text())
        assert all(digest(p) == installed[str(p)] for p in FILES), 'Later edits detected'
        restore()
        print('ROLLED_BACK')
        return
    assert not BACKUP.exists(), 'Backup exists; inspect previous operation first'
    assert '/var/log/nginx/*.log' in Path('/etc/logrotate.d/nginx').read_text()
    contents = candidate(*(p.read_text() for p in FILES))
    before = run('docker', 'ps', '--no-trunc', '--format', '{{.ID}} {{.Names}}')
    BACKUP.mkdir(mode=0o700, parents=True)
    for p in FILES:
        shutil.copy2(p, BACKUP / p.name)
    try:
        for p, content in zip(FILES, contents):
            p.write_text(content)
        reload()
        checks = verify()
        assert before == run('docker', 'ps', '--no-trunc', '--format', '{{.ID}} {{.Names}}')
        (BACKUP / 'installed-hashes.json').write_text(json.dumps({str(p): digest(p) for p in FILES}))
        report = {'result': 'PASS', 'checks': checks, 'containersUnchanged': True,
                  'backup': str(BACKUP), 'log': str(LOG), 'rotationDays': 14}
        (BACKUP / 'verification.json').write_text(json.dumps(report, indent=2))
        print(json.dumps(report))
    except BaseException:
        restore()
        raise


if __name__ == '__main__':
    main()
