"""Read-only aggregate production outbox diagnosis. No payloads or credentials emitted."""
import subprocess,os
assert os.geteuid()==0
js=r"""
await import('reflect-metadata');
const {loadRuntimeSecrets}=await import('./dist/common/config/file-json-secret-loader.js');
const {validateEnvironment}=await import('./dist/common/config/environment.js');
const {PrismaService}=await import('./dist/common/database/prisma.service.js');
await loadRuntimeSecrets(process.env);const config=validateEnvironment(process.env).RUNTIME_CONFIG;
if(config.appEnvironment!=='production')throw Error('Unexpected environment');
const db=new PrismaService(config);
try{const result=await db.$transaction(async tx=>{
 await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
 await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '15s'");
 const queries={
 statuses:`SELECT status,count(*)::int AS count,min(created_at) oldest,max(created_at) newest,sum(attempts)::int attempts,count(*) FILTER(WHERE last_error_code IS NOT NULL)::int errors,count(*) FILTER(WHERE locked_at IS NOT NULL)::int locked FROM outbox_events GROUP BY status`,
 types:`SELECT event_type,count(*)::int count,sum(attempts)::int attempts FROM outbox_events WHERE status IN ('PENDING','FAILED') GROUP BY event_type ORDER BY count DESC`,
 otherOrganizations:`SELECT o.organization_code,count(*)::int count FROM outbox_events e JOIN organizations o ON o.id=e.organization_id WHERE o.organization_code<>'BNBU' GROUP BY o.organization_code ORDER BY count DESC`,
 scope:`SELECT CASE WHEN o.organization_code='BNBU' THEN 'BNBU' ELSE 'OTHER_ORGANIZATIONS' END AS scope,count(*)::int count,count(DISTINCT o.id)::int organizations FROM outbox_events e JOIN organizations o ON o.id=e.organization_id WHERE e.status IN ('PENDING','FAILED') GROUP BY 1`,
 days:`SELECT created_at::date AS event_date,count(*)::int count FROM outbox_events GROUP BY 1 ORDER BY 1`,
 due:`SELECT count(*) FILTER(WHERE available_at<=now())::int due,count(*) FILTER(WHERE available_at>now())::int future,count(*) FILTER(WHERE created_at>=now()-interval '1 hour')::int last_hour FROM outbox_events WHERE status IN ('PENDING','FAILED')`,
 bnbuTypes:`SELECT e.event_type,count(*)::int count FROM outbox_events e JOIN organizations o ON o.id=e.organization_id WHERE o.organization_code='BNBU' GROUP BY e.event_type ORDER BY count DESC`
 };const results={checkedAt:new Date().toISOString()};for(const [name,sql] of Object.entries(queries))results[name]=await tx.$queryRawUnsafe(sql);return results;
},{timeout:30000});const fs=await import('node:fs');const calls=[];function scan(path){for(const entry of fs.readdirSync(path,{withFileTypes:true})){if(entry.name==='generated')continue;const file=path+'/'+entry.name;if(entry.isDirectory())scan(file);else if(file.endsWith('.js')&&/\.(claimBatch|markProcessed|markFailed)\(/.test(fs.readFileSync(file,'utf8')))calls.push(file);}}scan('/app/dist');result.runtimeOutboxConsumers=calls;console.log(JSON.stringify(result));}finally{await db.$disconnect();}
"""
image=subprocess.check_output(['docker','inspect','--format','{{.Image}}','bnbu-sports-production-backend-1'],text=True).strip()
args=['docker','run','--rm','--network','host','--read-only','--tmpfs','/tmp','--cap-drop','ALL','--security-opt','no-new-privileges','--user','10001:10001','--group-add','10001','--env-file','/opt/bnbu-sports-production/current/production.env','--env-file','/etc/bnbu-sports-production/mail.env','-v','/etc/bnbu-sports-production/secrets/runtime.json:/run/secrets/runtime.json:ro','-v','/etc/bnbu-sports-production/secrets/tencentdb-ca-chain.pem:/run/secrets/tencentdb-ca-chain.pem:ro','--entrypoint','node',image,'--input-type=module','-e',js]
raise SystemExit(subprocess.run(args).returncode)
