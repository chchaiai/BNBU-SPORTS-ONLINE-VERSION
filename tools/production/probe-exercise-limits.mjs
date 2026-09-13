import assert from 'node:assert/strict';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
const id=process.argv[2];assert.match(id,/^[0-9a-f-]{36}$/);
await loadRuntimeSecrets(process.env);const config=validateEnvironment(process.env).RUNTIME_CONFIG;
assert.equal(config.appEnvironment,'production');const db=new PrismaService(config);
try{
 const rows=await db.$transaction(async tx=>{
  await tx.$executeRaw`SET TRANSACTION READ ONLY`;
  return tx.$queryRaw`SELECT s.status,s.actual_duration_seconds,s.maximum_duration_seconds,
   EXISTS(SELECT 1 FROM v81_events e WHERE e.resource_id=s.id AND e.event_type='DURATION_LIMIT_REACHED' AND e.is_system_actor=true) AS system_actor
   FROM exercise_sessions s JOIN organizations o ON o.id=s.organization_id
   WHERE s.id=${id}::uuid AND o.organization_code LIKE '%LIMIT12%'`;
 });
 assert.equal(rows.length,1);assert.equal(rows[0].status,'COMPLETED');assert.equal(rows[0].actual_duration_seconds,60n);
 assert.equal(rows[0].maximum_duration_seconds,60);assert.equal(rows[0].system_actor,true);
 console.log(JSON.stringify({check:'CLOUD_UNATTENDED_DURATION_LIMIT_SYSTEM_EVENT',result:'PASS',sessionId:id,durationSeconds:60}));
}finally{await db.$disconnect();}
