"""Temporarily enable or disable the isolated preview acceptance teacher."""
import os,sys,subprocess
from pathlib import Path
assert os.geteuid()==0
work=Path('/home/ubuntu/bnbu-bugfix-round2-20260910')
current=Path('/opt/bnbu-sports-production/current').resolve()
assert current.parent==Path('/opt/bnbu-sports-production/releases')
assert current.name in ['e4bd83eb4b5f-student-delete','c33f037b-teacher-cascade','teacher-preview-20260911']
image=subprocess.check_output(['docker','inspect','--format','{{.Config.Image}}','bnbu-sports-production-backend-1'],text=True).strip()
assert image.startswith('bnbu-backend-production:')
mode=sys.argv[1];assert mode in ['open','close']
script,args='teacher-preview-account.mjs',[mode]
subprocess.run(['docker','run','--rm','--network','host','--read-only','-e','BNBU_CASCADE_CLOUD=1','--tmpfs','/tmp','--cap-drop','ALL','--security-opt','no-new-privileges','--user','10001:10001','--group-add','10001','--env-file','/opt/bnbu-sports-production/current/production.env','--env-file','/etc/bnbu-sports-production/mail.env','-v','/etc/bnbu-sports-production/secrets/runtime.json:/run/secrets/runtime.json:ro','-v','/etc/bnbu-sports-production/secrets/tencentdb-ca-chain.pem:/run/secrets/tencentdb-ca-chain.pem:ro','-v',str(work/'long-acceptance')+':/acceptance','-v',str(work/script)+':/app/'+script+':ro','-v',str(work/'production-smoke-helpers.mjs')+':/app/production-smoke-helpers.mjs:ro','--entrypoint','node',image,'/app/'+script,*args],check=True)
