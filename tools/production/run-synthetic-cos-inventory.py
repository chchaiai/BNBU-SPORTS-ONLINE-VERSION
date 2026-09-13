import os,subprocess
from pathlib import Path
assert os.geteuid()==0
base=Path('/opt/bnbu-sports-production')
assert (base/'current').resolve().name=='semester-header-20260913'
image=subprocess.check_output(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-backend-1'],text=True).strip()
assert image=='sha256:c7253e550053e45b5f40bb0d447e4c971db54790554b9d658b7d07d627118ccb'
args=['docker','run','--rm','--network','host','--read-only','--tmpfs','/tmp','--cap-drop','ALL','--security-opt','no-new-privileges','--user','10001:10001','--group-add','10001','--env-file',str(base/'current/production.env'),'--env-file','/etc/bnbu-sports-production/mail.env']
for source,target in [('/etc/bnbu-sports-production/secrets/runtime.json','/run/secrets/runtime.json'),('/etc/bnbu-sports-production/secrets/tencentdb-ca-chain.pem','/run/secrets/tencentdb-ca-chain.pem'),('/home/ubuntu/inspect-synthetic-cos.mjs','/app/inspect-synthetic-cos.mjs'),('/home/ubuntu/synthetic-cleanup-inventory-v2.json','/app/synthetic-cleanup-inventory-v2.json')]:
 args+=['-v',source+':'+target+':ro']
subprocess.run(args+['--entrypoint','node',image,'/app/inspect-synthetic-cos.mjs'],check=True)
