"""Fixed target helper; never print environment or credential contents."""
import os, pathlib, subprocess, sys
assert os.geteuid()==0
work=pathlib.Path('/home/ubuntu/bnbu-performance-20260911')
mode=sys.argv[1]
assert mode in ['seed','refresh','close','monitor','cloud','inspect','history','activate','loopback']
private=work/'private'
private.mkdir(mode=0o700,exist_ok=True)
os.chown(private,10001,10001)
image=subprocess.check_output(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-backend-1'],text=True).strip()
script={'monitor':'db-monitor.mjs','cloud':'cloud-metrics.mjs','inspect':'db-inspect.mjs','history':'history.mjs','loopback':'loopback-probe.mjs'}.get(mode,'fixture.mjs')
args=['docker','run','--rm','--name','bnbu-perf-'+mode,'--network','host','--read-only','--tmpfs','/tmp','--memory','256m','--cpus','0.5','--pids-limit','64','--cap-drop','ALL','--security-opt','no-new-privileges','--user','10001:10001','--group-add','10001','--env-file','/opt/bnbu-sports-production/current/production.env','--env-file','/etc/bnbu-sports-production/mail.env','-v','/etc/bnbu-sports-production/secrets/runtime.json:/run/secrets/runtime.json:ro','-v','/etc/bnbu-sports-production/secrets/tencentdb-ca-chain.pem:/run/secrets/tencentdb-ca-chain.pem:ro','-v',str(private)+':/perf','-v',str(work/script)+':/app/'+script+':ro','-v','/home/ubuntu/bnbu-bugfix-round2-20260910/production-smoke-helpers.mjs:/app/production-smoke-helpers.mjs:ro','--entrypoint','node',image,'/app/'+script,mode]
subprocess.run(args,check=True,timeout=3650 if mode=='monitor' else 240)
if mode in ['seed','refresh','activate']:
 subprocess.run(['install','-o','ubuntu','-g','ubuntu','-m','600',str(private/'private.json'),str(work/'load-private.json')],check=True)
