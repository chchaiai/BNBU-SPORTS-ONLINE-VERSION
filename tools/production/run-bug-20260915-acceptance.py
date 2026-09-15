"""Prepare an isolated synthetic fixture using the deployed runtime identity."""
import os,subprocess,sys
from pathlib import Path
assert os.geteuid()==0
verify=sys.argv[1:]==['--verify']
assert sys.argv[1:] in [[],['--verify'],['--refresh-student']]
script='refresh-bug-20260915-session.mjs' if sys.argv[1:]==['--refresh-student'] else ('verify-bug-20260915.mjs' if verify else 'prepare-bug-20260915.mjs')
work=Path('/home/ubuntu/bnbu-bug-20260915')
assert Path('/opt/bnbu-sports-production/current').resolve().name=='bug-20260915'
directory=work/'acceptance';directory.mkdir(mode=0o700,exist_ok=True);os.chown(directory,10001,10001)
image=subprocess.check_output(['docker','inspect','--format','{{.Config.Image}}','bnbu-sports-production-backend-1'],text=True).strip()
assert image=='bnbu-backend-production:bug-20260915'
execution=subprocess.run(['docker','run','--rm','--network','host','--read-only','--tmpfs','/tmp','--cap-drop','ALL','--security-opt','no-new-privileges','--user','10001:10001','--group-add','10001','--env-file','/opt/bnbu-sports-production/current/production.env','--env-file','/etc/bnbu-sports-production/mail.env',
 '-v','/etc/bnbu-sports-production/secrets/runtime.json:/run/secrets/runtime.json:ro','-v','/etc/bnbu-sports-production/secrets/tencentdb-ca-chain.pem:/run/secrets/tencentdb-ca-chain.pem:ro',
 '-v',str(directory)+':/acceptance','-v',str(work/script)+':/app/'+script+':ro','-v','/home/ubuntu/bnbu-bug-20260912/production-smoke-helpers.mjs'+':/app/production-smoke-helpers.mjs:ro',
 '--entrypoint','node',image,'/app/'+script],check=False)
if execution.returncode: raise SystemExit(execution.returncode)
subprocess.run(['install','-o','ubuntu','-g','ubuntu','-m','0600',str(directory/'bug-20260915.json'),str(work/'bug-20260915-private.json')],check=True)
