import json,subprocess,os
from pathlib import Path
assert os.geteuid()==0
work=Path('/home/ubuntu/bnbu-feedback-final-20260918/bundle')
c=json.loads(subprocess.check_output(['docker','inspect','bnbu-sports-production-backend-1'],text=True))[0]
envfile=work/'storage-smoke.env';fd=os.open(envfile,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:f.write('\n'.join(c['Config']['Env'])+'\n')
args=['docker','run','--rm','--network','host','--read-only','--tmpfs','/tmp','--cap-drop','ALL','--security-opt','no-new-privileges','--user','10001:10001','--env-file',str(envfile),'-v',str(work/'storage-smoke.mjs')+':/app/storage-smoke.mjs:ro']
for m in c['Mounts']:
 if m['Destination'].startswith('/run/secrets/') or m['Destination']=='/run/clamav':args+=['-v',m['Source']+':'+m['Destination']+':ro']
for group in c['HostConfig'].get('GroupAdd') or []:args+=['--group-add',group]
args+=['--entrypoint','node',json.loads((work/'prepared.json').read_text())['backend'],'/app/storage-smoke.mjs']
try:subprocess.run(args,check=True)
finally:envfile.unlink()
