import assert from 'node:assert/strict';
import {enrichNotificationHistory} from '/app/notification-history-projection.mjs';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
await loadRuntimeSecrets(process.env);
const config=validateEnvironment(process.env).RUNTIME_CONFIG;
assert.equal(config.appEnvironment,'production');
const db=new PrismaService(config);
try {
 const result=await db.$transaction(async tx=>{
  await tx.$executeRaw`SET TRANSACTION READ ONLY`;
  const rows=await tx.notification.findMany({where:{notificationType:'EXERCISE_RECORD_RESULT'},take:501,orderBy:{createdAt:'asc'}});
  assert.ok(rows.length<=500);
  const enriched=await enrichNotificationHistory(tx,rows);
  assert.equal(enriched.length,rows.length);
  assert.ok(enriched.every(n=>n.reviewContent));
  for(let i=0;i<rows.length;i++) {
   assert.deepEqual({...enriched[i],reviewContent:rows[i].reviewContent},rows[i]);
  }
  assert.deepEqual(await tx.notification.findMany({where:{id:{in:rows.map(n=>n.id)}},orderBy:{createdAt:'asc'}}),rows);
  return {result:'PASS',scope:'Production read-only historical projection; no writes',total:rows.length,matched:enriched.filter(n=>n.reviewContent).length,results:enriched.map(n=>({id:n.id,stage:n.reviewContent.stage}))};
 },{timeout:30000});
 console.log(JSON.stringify(result));
} finally {await db.$disconnect();}
