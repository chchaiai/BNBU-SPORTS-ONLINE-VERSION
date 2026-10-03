"""Run on the authorized server with sudo after uploading location-lab.tar.gz."""
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile
import time

root = Path('/var/www/verityai-verify')
config = Path('/etc/nginx/sites-available/verify.verityai.cn.conf')
enabled = Path('/etc/nginx/sites-enabled/verify.verityai.cn.conf')
if config.exists() or enabled.exists() or root.exists():
    raise SystemExit('Target already exists; inspect before updating this first-deployment script.')
release = root / 'releases' / time.strftime('%Y%m%d-%H%M%S', time.gmtime())
release.mkdir(parents=True)
allowed = {'index.html', 'style.css', 'app.js', 'fingerprint.js', 'location-lab.apk'}
with tarfile.open('/home/ubuntu/location-lab.tar.gz') as archive:
    members = archive.getmembers()
    if {m.name for m in members} != allowed or any(not m.isfile() for m in members):
        raise SystemExit('Unexpected archive contents')
    for member in members:
        (release / member.name).write_bytes(archive.extractfile(member).read())
        (release / member.name).chmod(0o644)
(root / 'current').symlink_to(release)
http = '''server {
 listen 80;
 listen [::]:80;
 server_name verify.verityai.cn;
 location ^~ /.well-known/acme-challenge/ { root /var/lib/letsencrypt; try_files $uri =404; }
 location / { return 308 https://verify.verityai.cn$request_uri; }
}
'''
https = '''server {
 listen 443 ssl http2;
 listen [::]:443 ssl http2;
 server_name verify.verityai.cn;
 ssl_certificate /etc/letsencrypt/live/verify.verityai.cn/fullchain.pem;
 ssl_certificate_key /etc/letsencrypt/live/verify.verityai.cn/privkey.pem;
 ssl_protocols TLSv1.2 TLSv1.3;
 server_tokens off;
 root /var/www/verityai-verify/current;
 index index.html;
 charset utf-8;
 add_header X-Content-Type-Options nosniff always;
 add_header Referrer-Policy no-referrer always;
 add_header Cache-Control no-store always;
 add_header Permissions-Policy "geolocation=(self)" always;
 add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'self' data:; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'" always;
 location = /location-lab.apk { types {} default_type application/vnd.android.package-archive; try_files $uri =404; }
 location ~ /\\. { deny all; }
 location / { try_files $uri $uri/ =404; }
}
'''
def run(*args):
    return subprocess.run(args, check=True, text=True)
try:
    config.write_text(http)
    enabled.symlink_to(config)
    run('nginx', '-t')
    run('systemctl', 'reload', 'nginx')
    run('certbot', 'certonly', '--webroot', '-w', '/var/lib/letsencrypt', '-d', 'verify.verityai.cn', '--non-interactive', '--keep-until-expiring')
    config.write_text(http + https)
    run('nginx', '-t')
    run('systemctl', 'reload', 'nginx')
    run('curl', '--retry', '5', '--retry-delay', '2', '--retry-all-errors', '-fsS', '-o', '/dev/null', 'https://verify.verityai.cn/')
except Exception:
    enabled.unlink(missing_ok=True)
    run('nginx', '-t')
    run('systemctl', 'reload', 'nginx')
    raise
result = {'url': 'https://verify.verityai.cn/', 'release': str(release), 'sha256': {name: hashlib.sha256((release/name).read_bytes()).hexdigest() for name in sorted(allowed)}, 'rollback': 'sudo unlink /etc/nginx/sites-enabled/verify.verityai.cn.conf && sudo nginx -t && sudo systemctl reload nginx'}
(root/'deployment.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result, indent=2))
