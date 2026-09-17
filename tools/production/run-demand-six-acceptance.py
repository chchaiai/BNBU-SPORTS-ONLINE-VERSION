"""Run bounded synthetic acceptance with the deployed runtime and private output."""
import os,subprocess,sys,json
from pathlib import Path
assert os.geteuid()==0
action=sys.argv[1];assert action in ['prepare','verify','finish','video']
work=Path('/home/ubuntu/bnbu-demand-six-20260917');release=Path('/opt/bnbu-sports-production/current').resolve();assert release.name in ['demand-six-20260917']
directory=work/'acceptance';directory.mkdir(mode=0o700,exist_ok=True);os.chown(directory,10001,10001)
if action=='prepare':assert not (directory/'demand-six-20260917.json').exists(),'Fixture already exists'
if action=='verify':assert not (directory/'records.json').exists(),'Do not repeat paid submissions; resume existing records explicitly'
container=json.loads(subprocess.check_output(['docker','inspect','bnbu-sports-production-backend-1'],text=True))[0]
env=[item for item in container['Config']['Env'] if not item.startswith(('HOSTNAME=','HOME=','PATH=','NODE_VERSION=','YARN_VERSION='))]
envfile=work/'acceptance.env';envfile.write_text('\n'.join(env)+'\n');envfile.chmod(0o600)
script={'prepare':'prepare-demand-six-20260917.mjs','verify':'verify-demand-six-20260917.mjs','finish':'finish-demand-six-20260917.mjs','video':'verify-demand-six-video.mjs'}[action]
args=['docker','run','--rm','--network','host','--read-only','--tmpfs','/tmp','--cap-drop','ALL','--security-opt','no-new-privileges','--user','10001:10001','--group-add','10001','--env-file',str(envfile),'-v',str(directory)+':/acceptance','-v',str(work/script)+':/app/'+script+':ro','-v','/home/ubuntu/bnbu-bug-20260912/production-smoke-helpers.mjs:/app/production-smoke-helpers.mjs:ro']
for mount in container['Mounts']:
 if mount['Destination'].startswith('/run/secrets/'):args+=['-v',mount['Source']+':'+mount['Destination']+':ro']
args+=['--entrypoint','node',container['Image'],'/app/'+script]
try:subprocess.run(args,check=True)
finally:envfile.unlink()
if action=='prepare':subprocess.run(['install','-o','ubuntu','-g','ubuntu','-m','0600',str(directory/'demand-six-20260917.json'),str(work/'ai-review-private.json')],check=True)
