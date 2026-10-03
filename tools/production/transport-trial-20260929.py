"""Reversible HTTP/2 and TLS resumption trial against the current live baseline."""
from pathlib import Path
import subprocess, json, ssl, socket, http.client, hashlib, time, sys

BACKUP=Path('/opt/bnbu-sports-production/backups/transport-trial-20260929')
FILES=[Path('/etc/nginx/sites-available')/n for n in ['bnbu-sports-download.conf','bnbu-staging-hk.conf','knowledge.conf','verityai.conf']]
TARGETS=[('www.student.bnbusports.cn','/student/'),('www.teacher.bnbusports.cn','/'),('knowledge.verityai.cn','/'),('verityai.cn','/'),('www.verityai.cn','/'),('www.student.bnbusports.cn','/api/v1/health/ready')]
def run(*args): return subprocess.check_output(args,text=True).strip()
def states(): return run('docker','ps','--no-trunc','--format','{{.ID}} {{.Names}} {{.Image}}')
def probes():
    result=[]
    for host,path in TARGETS:
        ctx=ssl.create_default_context(); ctx.set_alpn_protocols(['h2','http/1.1'])
        with ctx.wrap_socket(socket.create_connection(('127.0.0.1',443),10),server_hostname=host) as s: protocol=s.selected_alpn_protocol()
        class Local(http.client.HTTPSConnection):
            def connect(self): self.sock=self._context.wrap_socket(socket.create_connection(('127.0.0.1',443),10),server_hostname=self.host)
        times=[]
        for _ in range(3):
            start=time.monotonic(); c=Local(host,timeout=15); c.request('GET',path); r=c.getresponse(); body=r.read(); headers=dict(r.getheaders()); c.close(); times.append(round((time.monotonic()-start)*1000,2))
            assert r.status==(404 if host=='www.verityai.cn' else 200),(host,path,r.status)
        result.append(dict(host=host,path=path,status=r.status,alpn=protocol,localMs=times,sha256=hashlib.sha256(body).hexdigest() if '/api/' not in path else None,cache=headers.get('Cache-Control')))
    return result
def reload():
    run('nginx','-t'); run('systemctl','reload','nginx'); time.sleep(2)
def restore():
    for p in FILES: p.write_bytes((BACKUP/p.name).read_bytes())
    reload()
if sys.argv[1:]==['--audit']:
    print(json.dumps(probes(),indent=2)); sys.exit()
if sys.argv[1:]==['--rollback']:
    applied=json.loads((BACKUP/'applied-hashes.json').read_text())
    assert all(hashlib.sha256(p.read_bytes()).hexdigest()==applied[p.name] for p in FILES),'Configuration drift; inspect before rollback'
    restore(); print('ROLLED_BACK'); sys.exit()
assert sys.argv[1:]==['--apply'] and not BACKUP.exists()
baseline=probes(); containers=states(); BACKUP.mkdir(parents=True)
for p in FILES: (BACKUP/p.name).write_bytes(p.read_bytes())
try:
    for p in FILES:
        content=p.read_text().replace('listen 443 ssl;','listen 443 ssl http2;').replace('listen [::]:443 ssl;','listen [::]:443 ssl http2;')
        # Add session caching only to SSL blocks without an existing explicit cache.
        import re
        content=re.sub(r'(ssl_protocols TLSv1\.2 TLSv1\.3;)(?!\n    # transport-trial)',r'\1\n    # transport-trial-20260929\n    ssl_session_cache shared:TransportTrialTLS:10m;\n    ssl_session_timeout 1h;',content) if 'ssl_session_cache' not in content else content
        p.write_text(content)
    reload(); after=probes(); assert containers==states()
    assert all(x['alpn']=='h2' for x in after)
    assert all(a['sha256']==b['sha256'] and a['cache']==b['cache'] for a,b in zip(baseline,after))
    (BACKUP/'applied-hashes.json').write_text(json.dumps({p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in FILES}))
    result={'result':'PASS','before':baseline,'after':after,'containersUnchanged':True,'rollback':str(BACKUP),'http3':'UNSUPPORTED_BY_INSTALLED_NGINX'}
    (BACKUP/'result.json').write_text(json.dumps(result,indent=2)); print(json.dumps(result,indent=2))
except Exception:
    restore(); raise
