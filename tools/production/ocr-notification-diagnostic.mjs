// Read-only aggregate diagnostic; never consumes events or sends messages.
import assert from 'node:assert/strict';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
await loadRuntimeSecrets(process.env);const config=validateEnvironment(process.env).RUNTIME_CONFIG;
assert.equal(config.appEnvironment,'production');const db=new PrismaService(config);
try{
 const facts=await db.$transaction(async tx=>{
  await tx.$executeRaw`SET TRANSACTION READ ONLY`;
  const outbox=await tx.$queryRaw`SELECT event_type,status,count(*)::int AS count,max(attempts)::int AS max_attempts,min(created_at) AS oldest FROM outbox_events GROUP BY event_type,status ORDER BY count(*) DESC`;
  const syntheticNotifications=await tx.$queryRaw`SELECT notification_type,count(*)::int AS count,count(read_at)::int AS read_count FROM notifications WHERE organization_id='01a096c2-20a2-706b-8c69-802f67dee12c'::uuid GROUP BY notification_type ORDER BY notification_type`;
  return {outbox,syntheticNotifications};
 });console.log(JSON.stringify({check:'READ_ONLY_NOTIFICATION_DIAGNOSTIC',observedAt:new Date().toISOString(),...facts,scope:'Global event-type counts and synthetic organization notification counts only; no payloads, recipients or event mutations'}));
}finally{await db.$disconnect();}
