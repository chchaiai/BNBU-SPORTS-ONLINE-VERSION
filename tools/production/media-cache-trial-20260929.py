from pathlib import Path
import subprocess, http.client, ssl, socket, hashlib, json, sys, time
CONFIG=Path('/etc/nginx/sites-available/verityai.conf')
BACKUP=Path('/opt/bnbu-sports-production/backups/media-cache-trial-20260929')
PATHS=['/team/wang.webp','/team/chen.webp','/team/you.webp','/team/kuan.webp','/team/backgrounds/wang-wide.webp','/brand/verity-ai-symbol-white.svg']
def run(*args):return subprocess.check_output(args,text=True).strip()
class Local(http.client.HTTPSConnection):
 def connect(self):self.sock=self._context.wrap_socket(socket.create_connection(('127.0.0.1',443),10),server_hostname=self.host)
def fetch(path,headers=None):
 c=Local('verityai.cn',timeout=15);c.request('GET',path,headers=headers or {});r=c.getresponse();data=r.read();h=dict(r.getheaders());c.close();return r.status,h,data
def reload():run('nginx','-t');run('systemctl','reload','nginx');time.sleep(2)
if sys.argv[1:]==['--rollback']:
 assert hashlib.sha256(CONFIG.read_bytes()).hexdigest()==(BACKUP/'after.sha256').read_text(),'Configuration drift'
 CONFIG.write_bytes((BACKUP/'before.conf').read_bytes());reload();print('ROLLED_BACK');sys.exit()
assert sys.argv[1:]==['--apply'] and not BACKUP.exists()
before={p:fetch(p) for p in PATHS}; homepage=fetch('/');assert all(v[0]==200 for v in before.values())
original=CONFIG.read_bytes();text=original.decode();anchor='    location ^~ /_next/static/ {';assert text.count(anchor)==1
replacement='''    # Public, stable image filenames revalidate on reuse.
    location ~ ^/(?:team|brand)/.*\\.(?:webp|png|jpe?g|svg|avif)$ {
        add_header Cache-Control "public, no-cache";
        add_header X-Content-Type-Options nosniff always;
        try_files $uri =404;
    }
'''+anchor
BACKUP.mkdir(parents=True);(BACKUP/'before.conf').write_bytes(original)
try:
 CONFIG.write_text(text.replace(anchor,replacement));reload();checks=[]
 for p,(status,h,body) in before.items():
  s,headers,data=fetch(p);assert s==200 and data==body and headers['Cache-Control']=='public, no-cache'
  conditional=fetch(p,{'If-None-Match':headers['ETag']});assert conditional[0]==304 and not conditional[2]
  checks.append({'path':p,'bytes':len(body),'beforeCache':h.get('Cache-Control'),'afterCache':headers['Cache-Control'],'conditionalStatus':304,'bytesEqual':True})
 current=fetch('/');assert homepage[0]==current[0] and homepage[2]==current[2] and homepage[1].get('Cache-Control')==current[1].get('Cache-Control')
 (BACKUP/'after.sha256').write_text(hashlib.sha256(CONFIG.read_bytes()).hexdigest())
 result={'result':'PASS','checks':checks,'rollback':str(BACKUP)};(BACKUP/'result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
except Exception:
 CONFIG.write_bytes(original);reload();raise
