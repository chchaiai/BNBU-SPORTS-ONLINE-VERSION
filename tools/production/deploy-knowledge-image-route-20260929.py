"""Publish the image endpoint on a separate loopback service, retaining the predecessor."""
from pathlib import Path
import subprocess,json,http.client,hashlib,base64,time,sys,ssl,socket
WORK=Path('/home/ubuntu/knowledge-images-20260929')
RELEASE=Path('/opt/team-knowledge-base/releases/images-20260929')
CONFIG=Path('/etc/nginx/sites-available/knowledge.conf')
MAIN='knowledge-production-app-1';NAME='knowledge-images-app-1';TAG='knowledge-app:images-20260929'
def run(*a):return subprocess.check_output(a,text=True).strip()
def inspect(name):return json.loads(run('docker','inspect',name))[0]
def fetch(port,path,headers=None):
 c=http.client.HTTPConnection('127.0.0.1',port,timeout=15);c.request('GET',path,headers=headers or {});r=c.getresponse();b=r.read();h=dict(r.getheaders());c.close();return r.status,h,b
def reload(content):
 previous=CONFIG.read_bytes();CONFIG.write_text(content)
 try:run('nginx','-t')
 except Exception:CONFIG.write_bytes(previous);raise
 run('systemctl','reload','nginx');time.sleep(2)
def https(path):
 c=http.client.HTTPSConnection('knowledge.verityai.cn',timeout=15)
 c.sock=ssl.create_default_context().wrap_socket(socket.create_connection(('127.0.0.1',443),15),server_hostname='knowledge.verityai.cn')
 c.request('GET',path);r=c.getresponse();b=r.read();c.close();return r.status,b
assert sys.argv[1:] in [['--apply'],['--rollback']]
if sys.argv[1:]==['--rollback']:
 assert hashlib.sha256(CONFIG.read_bytes()).hexdigest()==(RELEASE/'after.sha256').read_text(),'Configuration drift'
 assert fetch(4311,'/api/health')[0]==200
 reload((RELEASE/'before.conf').read_text());assert https('/api/health')[0]==200
 print('ROLLED_BACK; candidate retained for old connections');sys.exit()
assert not RELEASE.exists()
assert not run('docker','ps','-aq','--filter','name=^/'+NAME+'$')
gate=json.loads((WORK/'test-gate.json').read_text());assert gate['result']=='PASS'
assert run('docker','image','inspect',TAG,'--format','{{.Id}}')==gate['image']
main=inspect(MAIN);assert main['Config']['Image']=='knowledge-app:20260927T071732Z'
original=CONFIG.read_text();assert original.count('proxy_pass http://127.0.0.1:4311;')==1
assert not run('docker','ps','-q','--filter','publish=4312'),'Loopback test port is occupied'
network=next(iter(main['NetworkSettings']['Networks']));volume=next(v['Name'] for v in main['Mounts'] if v['Destination']=='/app/data/files')
RELEASE.mkdir(parents=True,mode=0o700)
(RELEASE/'before.conf').write_text(original)
(RELEASE/'runtime.env').write_text('\n'.join(main['Config']['Env'])+'\n');(RELEASE/'runtime.env').chmod(0o600)
compose={'name':'knowledge-images','services':{'app':{'image':TAG,'container_name':NAME,'env_file':['runtime.env'],'ports':['127.0.0.1:4312:4311'],'volumes':['files:/app/data/files'],'networks':['production'],'mem_limit':'256m','restart':'unless-stopped','healthcheck':{'test':['CMD','node','-e',"fetch('http://127.0.0.1:4311/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],'interval':'10s','timeout':'5s','retries':5},'logging':{'driver':'json-file','options':{'max-size':'10m','max-file':'2'}}}},'networks':{'production':{'external':True,'name':network}},'volumes':{'files':{'external':True,'name':volume}}}
(RELEASE/'compose.json').write_text(json.dumps(compose,indent=2))
run('docker','compose','-f',str(RELEASE/'compose.json'),'up','-d','--no-build','--pull','never')
try:
 for _ in range(30):
  try:
   if fetch(4312,'/api/health')[0]==200:break
  except OSError:pass
  time.sleep(1)
 else:raise RuntimeError('candidate unhealthy')
 old=fetch(4311,'/api/members');new=fetch(4312,'/api/members');assert old[0]==new[0]==200
 oldrows=json.loads(old[2]);newrows=json.loads(new[2]);assert len(oldrows)==len(newrows)
 count=0
 for a,b in zip(oldrows,newrows):
  restored=dict(b)
  for field in ['avatar','cover']:
   if str(b.get(field,'')).startswith('/api/members/'):
    s,h,data=fetch(4312,b[field]);assert s==200
    restored[field]='data:'+h['content-type']+';base64,'+base64.b64encode(data).decode()
    assert fetch(4312,b[field],{'If-None-Match':h['etag']})[0]==304;count+=1
  assert a==restored,'Member changed during comparison; retry with a fresh baseline'
 assert fetch(4312,'/api/admin/overview')[0]==401
 before_home=https('/')
 candidate=original.replace('proxy_pass http://127.0.0.1:4311;','proxy_pass http://127.0.0.1:4312;')
 reload(candidate);assert https('/')==before_home
 assert https('/api/members')==(200,new[2]) and https('/api/health')[0]==200
 assert https('/api/admin/overview')[0]==401
 assert inspect(MAIN)['Id']==main['Id'] and inspect(MAIN)['State']['StartedAt']==main['State']['StartedAt']
 (RELEASE/'after.sha256').write_text(hashlib.sha256(CONFIG.read_bytes()).hexdigest())
 result={'result':'PASS','image':gate['image'],'beforeMembersJsonBytes':len(old[2]),'afterMembersJsonBytes':len(new[2]),'originalImagesVerified':count,'memberFieldsEqual':True,'oldServiceRetained':True,'release':str(RELEASE),'schemaMigrations':0,'productionBusinessWrites':0}
 (RELEASE/'deployment.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
except Exception:
 if CONFIG.read_text()!=original:reload(original)
 print('Routing restored. Candidate retained on loopback for inspection.');raise
