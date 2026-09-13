"""Prepare an isolated synthetic fixture using the deployed runtime identity."""
import os,subprocess,sys,re
from pathlib import Path
assert os.geteuid()==0
work=Path('/home/ubuntu/bnbu-membership-20260913')
assert Path('/opt/bnbu-sports-production/current').resolve().name=='membership-20260913'
directory=work/'acceptance';directory.mkdir(mode=0o700,exist_ok=True);os.chown(directory,10001,10001)
image=subprocess.check_output(['docker','inspect','--format','{{.Config.Image}}','bnbu-sports-production-backend-1'],text=True).strip()
assert image=='bnbu-backend-production:membership-20260913'
probe=len(sys.argv)==3 and sys.argv[1]=='--audit-enrollment'
if len(sys.argv)>1:assert probe and re.fullmatch('[a-f0-9-]{36}',sys.argv[2])
script='probe-membership.mjs' if probe else 'prepare-membership.mjs'
subprocess.run(['docker','run','--rm','--network','host','--read-only','--tmpfs','/tmp','--cap-drop','ALL','--security-opt','no-new-privileges','--user','10001:10001','--group-add','10001','--env-file','/opt/bnbu-sports-production/current/production.env','--env-file','/etc/bnbu-sports-production/mail.env',
 '-v','/etc/bnbu-sports-production/secrets/runtime.json:/run/secrets/runtime.json:ro','-v','/etc/bnbu-sports-production/secrets/tencentdb-ca-chain.pem:/run/secrets/tencentdb-ca-chain.pem:ro',
 '-v',str(directory)+':/acceptance','-v',str(work/script)+':/app/'+script+':ro','-v',str(work/'production-smoke-helpers.mjs')+':/app/production-smoke-helpers.mjs:ro',
 '--entrypoint','node',image,'/app/'+script,*([sys.argv[2]] if probe else [])],check=True)
if probe:sys.exit(0)
subprocess.run(['install','-o','ubuntu','-g','ubuntu','-m','0600',str(directory/'membership-20260913.json'),str(work/'membership-20260913-private.json')],check=True)
