"""Back up, apply and verify reversible Nginx transport optimizations."""
from pathlib import Path
import subprocess
import json
import hashlib
import urllib.request
import ssl
import gzip
import sys
import time

BACKUP = Path('/opt/bnbu-sports-production/backups/http-optimization-20260928')
MAIN = Path('/etc/nginx/nginx.conf')
SPORTS = Path('/etc/nginx/sites-available/bnbu-staging-hk.conf')
FILES = [MAIN, SPORTS]

def run(*args):
    return subprocess.check_output(args, text=True).strip()

def states():
    return run('docker', 'ps', '--no-trunc', '--format', '{{.ID}} {{.Names}} {{.Status}}')

def reload():
    run('nginx', '-t')
    run('systemctl', 'reload', 'nginx')
    time.sleep(2)

def restore():
    for p in FILES:
        p.write_bytes((BACKUP / p.name).read_bytes())
    reload()

if sys.argv[1:] == ['--rollback']:
    restore()
    print('ROLLED_BACK')
    raise SystemExit
assert sys.argv[1:] == ['--apply']
before = states()
if BACKUP.exists():
    assert all(p.read_bytes() == (BACKUP / p.name).read_bytes() for p in FILES), 'Live configuration differs from rollback baseline'
else:
    BACKUP.mkdir(parents=True)
    for p in FILES:
        (BACKUP / p.name).write_bytes(p.read_bytes())

try:
    main = MAIN.read_text()
    assert main.count('gzip on;') == 1
    assert not any(line.strip().startswith('gzip_types ') for line in main.splitlines())
    main = main.replace('gzip on;', '''gzip on;
    # HTTP optimization 20260928: compress static text across hosted sites.
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types text/css application/javascript text/javascript image/svg+xml application/wasm;''')
    sports = SPORTS.read_text()
    anchor = '    location /student/ { try_files $uri $uri/ =404; }'
    assert sports.count(anchor) == 1
    sports = sports.replace(anchor, '''    # Stable filenames must revalidate after each navigation/deployment.
    location ~ ^/student/.*\\.(?:js|css|svg|png|jpg|jpeg|webp|woff|woff2)$ {
        add_header X-Content-Type-Options nosniff always;
        add_header Referrer-Policy strict-origin-when-cross-origin always;
        add_header Cache-Control "public, no-cache" always;
        try_files $uri =404;
    }
''' + anchor)
    anchor = '    location / {\n        proxy_pass http://127.0.0.1:3100;'
    assert sports.count(anchor) == 1
    sports = sports.replace(anchor, '''    # Vite content-hashed assets are immutable; HTML retains no-store.
    location ~ "^/assets/[^/]+-[A-Za-z0-9_-]{8,}\\.(js|css|woff2?|png|jpg|jpeg|webp|svg)$" {
        proxy_pass http://127.0.0.1:3100;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_hide_header Cache-Control;
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header X-Content-Type-Options nosniff always;
        add_header Referrer-Policy strict-origin-when-cross-origin always;
    }
''' + anchor)
    MAIN.write_text(main)
    SPORTS.write_text(sports)
    reload()
    # Use local TLS routing while validating the real hostname/certificate.
    import http.client
    class LocalHTTPS(http.client.HTTPSConnection):
        def connect(self):
            import socket
            self.sock = self._context.wrap_socket(socket.create_connection(('127.0.0.1',443),10), server_hostname=self.host)
    def fetch(host, path, headers=None):
        c=LocalHTTPS(host, timeout=10)
        c.request('GET', path, headers=headers or {})
        r=c.getresponse(); result=(r.status,dict(r.getheaders()),r.read()); c.close(); return result
    results=[]
    for host,path in [('www.student.bnbusports.cn','/student/'),('www.teacher.bnbusports.cn','/'),('verityai.cn','/'),('knowledge.verityai.cn','/'),('www.student.bnbusports.cn','/api/v1/health/ready'),('www.teacher.bnbusports.cn','/api/v1/health/ready')]:
        status,h,b=fetch(host,path)
        assert status==200,(host,path,status)
        results.append({'host':host,'path':path,'status':status})
    for path in ['/student/js/app.js','/student/js/api.js','/student/css/screens.css']:
        status,rawh,raw=fetch('www.student.bnbusports.cn',path)
        status,h,compressed=fetch('www.student.bnbusports.cn',path,{'Accept-Encoding':'gzip'})
        assert status==200 and h.get('Content-Encoding')=='gzip', (path,status,h)
        assert gzip.decompress(compressed)==raw
        assert h.get('Cache-Control')=='public, no-cache'
        assert 'Accept-Encoding' in h.get('Vary','')
        status,_,_=fetch('www.student.bnbusports.cn',path,{'If-None-Match':rawh['ETag']})
        assert status==304
        results.append({'path':path,'raw':len(raw),'gzip':len(compressed),'conditionalStatus':status})
    assert run('docker','ps','--no-trunc','--format','{{.ID}} {{.Names}}') == '\n'.join(' '.join(l.split()[:2]) for l in before.splitlines())
    report={'result':'PASS','backup':str(BACKUP),'checks':results,'containersUnchanged':True}
    (BACKUP/'verification.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report))
except Exception:
    restore()
    raise
