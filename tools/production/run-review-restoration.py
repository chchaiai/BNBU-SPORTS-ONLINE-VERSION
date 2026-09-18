import json,subprocess,os
from pathlib import Path
assert os.geteuid()==0
work=Path('/home/ubuntu/bnbu-review-updates-final-20260918/bundle')
c=json.loads(subprocess.check_output(['docker','inspect','bnbu-sports-production-backend-1'],text=True))[0]
envfile=work/'restoration.env';fd=os.open(envfile,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:f.write('\n'.join(c['Config']['Env'])+'\n')
args=['docker','run','--rm','--network','host','--read-only','--tmpfs','/tmp','--cap-drop','ALL','--security-opt','no-new-privileges','--user','10001:10001','--env-file',str(envfile),'-v',str(work/'restore.mjs')+':/app/restore.mjs:ro']
for m in c['Mounts']:
 if m['Destination'].startswith('/run/secrets/'):args+=['-v',m['Source']+':'+m['Destination']+':ro']
import sys
assert sys.argv[1:] in [[],['--apply']]
args+=['--entrypoint','node',c['Image'],'/app/restore.mjs']+sys.argv[1:]
try:subprocess.run(args,check=True)
finally:envfile.unlink()
