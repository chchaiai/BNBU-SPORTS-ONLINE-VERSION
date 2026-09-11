"""Run guarded course-closure repair/acceptance on the authorized production host."""
import os,sys,subprocess
from pathlib import Path
assert os.geteuid()==0
work=Path('/home/ubuntu/bnbu-bugfix-round2-20260910')
current=Path('/opt/bnbu-sports-production/current').resolve()
assert current.parent==Path('/opt/bnbu-sports-production/releases')
assert current.name=='f87dba74f39d-closure' or current.name.endswith('-student-delete')
image=subprocess.check_output(['docker','inspect','--format','{{.Config.Image}}','bnbu-sports-production-backend-1'],text=True).strip()
assert image.startswith('bnbu-backend-production:')
mode=sys.argv[1];commands={'prepare':('prepare-student-deletion-acceptance.mjs',[]),'finish':('finish-student-deletion-acceptance.mjs',[]),'verify':('verify-student-deletion-acceptance.mjs',[])}
script,args=commands[mode]
subprocess.run(['docker','run','--rm','--network','host','--read-only','--tmpfs','/tmp','--cap-drop','ALL','--security-opt','no-new-privileges','--user','10001:10001','--group-add','10001','--env-file','/opt/bnbu-sports-production/current/production.env','--env-file','/etc/bnbu-sports-production/mail.env','-v','/etc/bnbu-sports-production/secrets/runtime.json:/run/secrets/runtime.json:ro','-v','/etc/bnbu-sports-production/secrets/tencentdb-ca-chain.pem:/run/secrets/tencentdb-ca-chain.pem:ro','-v',str(work/'long-acceptance')+':/acceptance','-v',str(work/script)+':/app/'+script+':ro','-v',str(work/'production-smoke-helpers.mjs')+':/app/production-smoke-helpers.mjs:ro','--entrypoint','node',image,'/app/'+script,*args],check=True)
if mode=='prepare':subprocess.run(['install','-o','ubuntu','-g','ubuntu','-m','0600',str(work/'long-acceptance/student-deletion-checkin.json'),str(work/'student-deletion-cloud-private.json')],check=True)
