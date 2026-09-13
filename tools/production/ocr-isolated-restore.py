"""Restore a private backup into a bounded, network-isolated ephemeral container."""
import subprocess,time,json,secrets
name='bnbu-restore-audit-20260913'
backup='/opt/bnbu-sports-production/backups/before-bugfix-20260913T022602Z.dump'
def run(args,**kw):return subprocess.run(args,check=True,capture_output=True,text=True,**kw)
assert run(['docker','ps','-aq','--filter','name=^/'+name+'$']).stdout.strip()==''
result={'check':'ISOLATED_POSTGRES_RESTORE','backup':backup,'productionDatabaseModified':False}
try:
 run(['docker','run','-d','--name',name,'--network','none','--cpus','0.5','--memory','512m','--memory-swap','512m','--pids-limit','128','--tmpfs','/var/lib/postgresql:rw,nosuid,size=384m','-e','POSTGRES_PASSWORD='+secrets.token_hex(24),'-v',backup+':/backup.dump:ro','postgres:18'])
 for i in range(45):
  probe=subprocess.run(['docker','exec',name,'pg_isready','-U','postgres'],capture_output=True)
  if probe.returncode==0:break
  time.sleep(1)
 else:raise RuntimeError('Temporary database readiness timeout')
 run(['docker','exec',name,'createdb','-U','postgres','restore_audit'])
 restored=run(['docker','exec',name,'pg_restore','-U','postgres','-d','restore_audit','--no-owner','--no-acl','--exit-on-error','/backup.dump'],timeout=180)
 count=run(['docker','exec',name,'psql','-U','postgres','-d','restore_audit','-Atc',"SELECT count(*) FROM pg_tables WHERE schemaname='public'"]).stdout.strip()
 result.update(result='PASS',publicTables=int(count),restoreExit=0)
except Exception as error:
 result.update(result='FAIL',errorType=type(error).__name__,returnCode=getattr(error,'returncode',None))
finally:
 cleanup=subprocess.run(['docker','rm','-f','-v',name],capture_output=True,text=True)
 result['temporaryContainerRemoved']=cleanup.returncode==0
print(json.dumps(result))
