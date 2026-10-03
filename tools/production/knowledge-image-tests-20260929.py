from pathlib import Path
import subprocess,time,json
WORK=Path('/home/ubuntu/knowledge-images-20260929')
BASE='sha256:225fba88b29b928f990aaa62b754a3ee116026063b289c9d7e82831199271ba4'
BASE_TAG='knowledge-app:20260927T071732Z'
TAG='knowledge-app:images-20260929'
def run(*args):return subprocess.check_output(args,text=True).strip()
assert run('docker','image','inspect',BASE_TAG,'--format','{{.Id}}')==BASE
(WORK/'server/existing-schema.mjs').write_text("import {buildApp} from './app.mjs';\nimport {pool} from './db.mjs';\nconst app=await buildApp({logger:true});\nawait app.listen({port:Number(process.env.PORT||4311),host:process.env.HOST||'127.0.0.1'});\nfor(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();await pool.end();process.exit(0);});\n")
(WORK/'Dockerfile').write_text(f'FROM {BASE_TAG}\nCOPY --chown=node:node server/app.mjs server/member-images.mjs server/existing-schema.mjs /app/server/\nCMD ["node", "server/existing-schema.mjs"]\n')
subprocess.run(['docker','build','--pull=false','-t',TAG,str(WORK)],check=True)
NET='knowledge-image-test-20260929';DB='knowledge-image-test-db-20260929'
assert not run('docker','ps','-aq','--filter','name=^/'+DB+'$')
run('docker','network','create','--internal',NET)
try:
 run('docker','run','-d','--name',DB,'--network',NET,'--network-alias','testdb','--memory','160m','--cpus','0.5','--tmpfs','/var/lib/postgresql/data:rw,size=128m','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine')
 for _ in range(30):
  if subprocess.run(['docker','exec',DB,'pg_isready','-U','postgres'],stdout=subprocess.DEVNULL).returncode==0:break
  time.sleep(1)
 else:raise RuntimeError('test database not ready')
 args=['docker','run','--rm','--network',NET,'--memory','192m','--cpus','0.5','--mount',f'type=bind,src={WORK}/tests,dst=/app/tests,readonly']
 for k,v in {'DATABASE_URL':'postgres://postgres@testdb/postgres','FILE_TOKEN_SECRET':'isolated-test-file-secret-20260929','OFFICE_JWT_SECRET':'isolated-test-office-secret-20260929','ADMIN_USERNAME':'testadmin','ADMIN_PASSWORD':'isolated-test-password-20260929','APP_ORIGIN':'http://localhost:4311'}.items():args+=['-e',k+'='+v]
 args += [TAG,'node','--test','--test-concurrency=1','tests/backend.test.mjs']
 result=subprocess.run(args,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 (WORK/'tests.log').write_text(result.stdout);print(result.stdout);assert result.returncode==0
 (WORK/'test-gate.json').write_text(json.dumps({'result':'PASS','isolatedDatabase':True,'productionDataUsed':False,'image':run('docker','image','inspect',TAG,'--format','{{.Id}}')}))
finally:
 subprocess.run(['docker','rm','-f',DB],check=False,stdout=subprocess.DEVNULL)
 subprocess.run(['docker','network','rm',NET],check=False,stdout=subprocess.DEVNULL)
