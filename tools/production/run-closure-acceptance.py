"""Run guarded course-closure repair/acceptance on the authorized production host."""
import os,sys,subprocess
from pathlib import Path
assert os.geteuid()==0
work=Path('/home/ubuntu/bnbu-bugfix-round2-20260910')
assert Path('/opt/bnbu-sports-production/current').resolve().name=='f87dba74f39d-closure'
mode=sys.argv[1];commands={'repair':('repair-closed-course-memberships.mjs',['--apply']),'prepare':('prepare-closure-acceptance.mjs',[]),'finish':('finish-closure-acceptance.mjs',[]),'verify':('verify-closure-acceptance.mjs',[]),'reopen-teacher':('finish-closure-acceptance.mjs',['--reopen-teacher'])}
script,args=commands[mode]
subprocess.run(['docker','run','--rm','--network','host','--read-only','--tmpfs','/tmp','--cap-drop','ALL','--security-opt','no-new-privileges','--user','10001:10001','--group-add','10001','--env-file','/opt/bnbu-sports-production/current/production.env','--env-file','/etc/bnbu-sports-production/mail.env','-v','/etc/bnbu-sports-production/secrets/runtime.json:/run/secrets/runtime.json:ro','-v','/etc/bnbu-sports-production/secrets/tencentdb-ca-chain.pem:/run/secrets/tencentdb-ca-chain.pem:ro','-v',str(work/'long-acceptance')+':/acceptance','-v',str(work/script)+':/app/'+script+':ro','-v',str(work/'production-smoke-helpers.mjs')+':/app/production-smoke-helpers.mjs:ro','--entrypoint','node','bnbu-backend-production:f87dba74-closure','/app/'+script,*args],check=True)
if mode=='prepare':subprocess.run(['install','-o','ubuntu','-g','ubuntu','-m','0600',str(work/'long-acceptance/closure-checkin.json'),str(work/'closure-cloud-private.json')],check=True)
