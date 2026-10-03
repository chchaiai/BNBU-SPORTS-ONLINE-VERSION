import assert from 'node:assert/strict';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
import {OutboxDiagnosticsService} from '/app/dist/modules/health/outbox-diagnostics.service.js';
await loadRuntimeSecrets(process.env);
const config=validateEnvironment(process.env).RUNTIME_CONFIG;
assert.equal(config.appEnvironment,'production');
assert.equal(config.publicOrganizationCode,'BNBU');
const db=new PrismaService(config);
try {
 const admin=await db.$transaction(async tx=>{
  await tx.$executeRaw`SET TRANSACTION READ ONLY`;
  const rows=await tx.$queryRaw`SELECT a.user_id,a.organization_id FROM v81_admin_access a JOIN users u ON u.id=a.user_id AND u.organization_id=a.organization_id JOIN organizations o ON o.id=a.organization_id WHERE o.organization_code='BNBU' AND a.kind='SUPER' AND NOT a.must_change_password AND u.status='ACTIVE' AND u.deleted_at IS NULL LIMIT 1`;
  assert.equal(rows.length,1);return rows[0];
 });
 const readonly={$transaction:(fn,options)=>db.$transaction(async tx=>{await tx.$executeRaw`SET TRANSACTION READ ONLY`;return fn(tx);},options)};
 const service=new OutboxDiagnosticsService(readonly,{decode:()=>null,encode:()=> 'verification-only'});
 const principal={organizationId:admin.organization_id,userId:admin.user_id,role:'ADMIN',sessionId:'read-only-release-verification'};
 const result=await service.list(principal,{limit:100,from:'2026-09-22T11:14:35Z',to:'2026-09-22T11:14:55Z'});
 const media=result.items.filter(e=>e.aggregateType==='MEDIA_EVIDENCE');assert.ok(media.length>=6);
 const workers=media.filter(e=>['MEDIA_PROCESSING_STARTED','MEDIA_AVAILABLE'].includes(e.eventType));
 const uploads=media.filter(e=>['MEDIA_UPLOAD_INITIATED','MEDIA_UPLOAD_CONFIRMED','MEDIA_BOUND'].includes(e.eventType));
 assert.ok(workers.length>0 && uploads.length>0);
 for(const e of workers){assert.equal(e.actor.actorRole,'SYSTEM');assert.equal(e.actor.actorName,null);}
 for(const e of uploads){assert.ok(e.actor.actorName);assert.notEqual(e.actor.actorRole,'SYSTEM');}
 console.log(JSON.stringify({result:'PASS',window:'2026-09-22 19:14:35–19:14:55 +08:00',mediaEvents:media.length,userEvents:uploads.length,systemEvents:workers.length,productionBusinessWrites:0}));
} finally {await db.$disconnect();}
