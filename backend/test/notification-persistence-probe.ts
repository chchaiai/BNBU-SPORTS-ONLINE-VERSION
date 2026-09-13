import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PrismaPg} from '@prisma/adapter-pg';
import {PrismaClient} from '../src/generated/prisma/client.js';
import {notifyRecord} from '../src/modules/v8/v81-notifications.js';
import {projectNotification} from '../src/modules/client-capabilities/client-messaging.projection.js';
const url=new URL(process.env.PROBE_DATABASE_URL!);
assert.equal(url.hostname,process.env.PROBE_EXPECTED_HOST);
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()})});
const rollback=new Error('EXPECTED_PROBE_ROLLBACK'),checks:string[]=[];
try{
 await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe("SET LOCAL lock_timeout='2s'");
  for(const sql of readFileSync('/workspace/backend/notification-migration.sql','utf8').split(';').map(s=>s.trim()).filter(Boolean))await tx.$executeRawUnsafe(sql);
  const organizationId=randomUUID(),userId=randomUUID(),id=randomUUID(),now=new Date();
  await tx.organization.create({data:{id:organizationId,organizationCode:'NP-'+Date.now(),legalName:'Synthetic notification probe',displayName:'Synthetic notification probe',timezone:'Asia/Shanghai',defaultLocale:'zh-CN',status:'ACTIVE',createdAt:now,updatedAt:now}});
  await tx.user.create({data:{id:userId,organizationId,role:'STUDENT',status:'ACTIVE',createdAt:now,updatedAt:now}});
  await notifyRecord(tx,{id,organizationId,recipientUserId:userId,recordId:randomUUID(),stage:'INVALID',reasonCode:'UNCLEAR_EVIDENCE',publicComment:'材料不清晰\nTeacher original',now});
  const row=await tx.notification.findUniqueOrThrow({where:{id}});
  assert.deepEqual(row.reviewContent,{version:1,stage:'INVALID',reasonCode:'UNCLEAR_EVIDENCE',publicComment:'材料不清晰\nTeacher original'});checks.push('REAL_NOTIFY_RECORD_PERSISTENCE');
  const projected=projectNotification(row);assert.deepEqual(projected.reviewContent,row.reviewContent);assert.equal(projected.body,'材料不清晰\n材料不清晰\nTeacher original');checks.push('DATABASE_READ_AND_PUBLIC_PROJECTION');
  await tx.notification.update({where:{id},data:{readAt:now,version:{increment:1}}});
  assert.deepEqual((await tx.notification.findUniqueOrThrow({where:{id}})).reviewContent,row.reviewContent);checks.push('READ_STATE_UPDATE_PRESERVES_REVIEW_FACTS');
  throw rollback;
 },{timeout:20000});
}catch(error){if(error!==rollback)throw error;}finally{await db.$disconnect();}
assert.equal(checks.length,3);console.log(JSON.stringify({check:'NOTIFICATION_POSTGRES_PERSISTENCE',result:'PASS',checks,rollback:true,scope:'Actual Prisma notifyRecord write/read/projection in local PostgreSQL, rolled back with schema and synthetic rows; not HTTP or production acceptance'}));
