import os,subprocess
from pathlib import Path
assert os.geteuid()==0
base=Path('/opt/bnbu-sports-production');assert (base/'current').resolve().name=='public-note-locale-20260913'
image=subprocess.check_output(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-backend-1'],text=True).strip()
assert image=='sha256:c7253e550053e45b5f40bb0d447e4c971db54790554b9d658b7d07d627118ccb'
directory=Path('/home/ubuntu/semester-history-20260913');directory.mkdir(mode=0o700,exist_ok=True);os.chown(directory,10001,10001)
assert not (directory/'semester-history-fixture.json').exists()
args=['docker','run','--rm','--network','host','--read-only','--tmpfs','/tmp','--cap-drop','ALL','--security-opt','no-new-privileges','--user','10001:10001','--group-add','10001','--env-file',str(base/'current/production.env'),'--env-file','/etc/bnbu-sports-production/mail.env']
for host,target in [('/etc/bnbu-sports-production/secrets/runtime.json','/run/secrets/runtime.json'),('/etc/bnbu-sports-production/secrets/tencentdb-ca-chain.pem','/run/secrets/tencentdb-ca-chain.pem'),('/home/ubuntu/semester-create-only.mjs','/app/semester-create-only.mjs'),('/home/ubuntu/create-semester-history-fixture.mjs','/app/create-semester-history-fixture.mjs')]:args+=['-v',host+':'+target+':ro']
args+=['-v',str(directory)+':/acceptance','--entrypoint','node',image,'/app/create-semester-history-fixture.mjs']
subprocess.run(args,check=True)
