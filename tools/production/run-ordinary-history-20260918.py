import json,subprocess,os,sys
from pathlib import Path
assert os.geteuid()==0
work=Path('/home/ubuntu/ordinary-history-20260918')
assert sys.argv[1:] in [['inspect'],['apply'],['verify']]
c=json.loads(subprocess.check_output(['docker','inspect','bnbu-sports-production-backend-1'],text=True))[0]
envfile=work/'runtime.env';fd=os.open(envfile,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:f.write('\n'.join(c['Config']['Env'])+'\n')
script='inspect.mjs' if sys.argv[1]=='inspect' else 'apply.mjs'
args=['docker','run','--rm','--network','host','--read-only','--tmpfs','/tmp','--cap-drop','ALL','--security-opt','no-new-privileges','--user','10001:10001','--env-file',str(envfile),'-v',str(work/script)+':/app/history.mjs:ro']
for m in c['Mounts']:
 if m['Destination'].startswith('/run/secrets/'):args+=['-v',m['Source']+':'+m['Destination']+':ro']
if script=='apply.mjs':args+=['-v',str(work/'history-core.mjs')+':/app/history-core.mjs:ro']
args+=['--entrypoint','node',c['Image'],'/app/history.mjs','--'+sys.argv[1]]
try:
 if sys.argv[1]=='apply':
  backup=json.loads(subprocess.check_output(['python3','/home/ubuntu/bnbu-feedback-final-20260918/bundle/backup.py'],text=True))
  assert backup['result']=='PASS' and backup['bytes']>0
  (work/'backup.json').write_text(json.dumps(backup,indent=2))
 output=subprocess.check_output(args,text=True)
 result=json.loads(output)
 (work/(sys.argv[1]+'.json')).write_text(json.dumps(result,indent=2))
 print(output.strip())
finally:envfile.unlink()
