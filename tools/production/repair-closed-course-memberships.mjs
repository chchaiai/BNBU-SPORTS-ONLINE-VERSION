// Scoped repair for the teacher identified by the supplied client diagnostic.
// Default is read-only planning. Apply rechecks every enrollment version.
import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';
import {v7 as uuidv7} from 'uuid';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
import {SecureDigestService} from '/app/dist/common/security/secure-digest.service.js';
import {AuditService} from '/app/dist/common/audit/audit.service.js';
import {OutboxService} from '/app/dist/common/outbox/outbox.service.js';
await loadRuntimeSecrets(process.env);const config=validateEnvironment(process.env).RUNTIME_CONFIG,db=new PrismaService(config);
const file='/acceptance/course-closure-repair-plan.json';assert.equal(config.appEnvironment,'production');
try{
 const actors=await db.$queryRaw`SELECT DISTINCT actor_user_id,organization_id FROM audit_logs WHERE safe_metadata->>'relatedRequestId'='01a08f87-d71b-71a0-b8b9-3bea4dba7e4e'`;
 assert.equal(actors.length,1);const actor=actors[0];
 const select=async tx=>{const sections=await tx.classSection.findMany({where:{organizationId:actor.organization_id,status:'CLOSED',teacher:{userId:actor.actor_user_id},enrollments:{some:{status:'ACTIVE'}}},include:{enrollments:{where:{status:'ACTIVE'},orderBy:{id:'asc'},select:{id:true,version:true,joinedAt:true}}},orderBy:{id:'asc'}});return sections.map(s=>({id:s.id,organizationId:s.organizationId,closedAt:s.closedAt?.toISOString(),members:s.enrollments.map(e=>({id:e.id,version:e.version,joinedAt:e.joinedAt.toISOString()}))}));};
 if(process.argv[2]!=='--apply'){
  const sections=await select(db);assert.ok(sections.length>0);for(const section of sections){assert.ok(section.closedAt);assert.ok(section.members.every(e=>e.joinedAt<=section.closedAt));}
  writeFileSync(file,JSON.stringify({actor,sections,createdAt:new Date().toISOString()}),{flag:'wx',mode:0o600});
  console.log(JSON.stringify({check:'COURSE_CLOSURE_REPAIR_PLAN',result:'PASS',courses:sections.length,members:sections.reduce((sum,s)=>sum+s.members.length,0)}));
 }else{
  const plan=JSON.parse(readFileSync(file,'utf8'));assert.deepEqual(plan.actor,actor);
  const {endCourseMemberships}=await import('/app/dist/modules/enrollments/application/course-closure-memberships.js');
  const clock={now:()=>new Date()},ids={next:uuidv7},audit=new AuditService(clock,ids,new SecureDigestService(config)),outbox=new OutboxService(db,clock,ids);
  const requestId=uuidv7();const removed=await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM organizations WHERE id=${actor.organization_id}::uuid FOR NO KEY UPDATE`;
   assert.deepEqual(await select(tx),plan.sections,'Live membership state changed; re-plan required');
   const ids=plan.sections.map(s=>s.id);const recordsBefore=await tx.exerciseRecord.count({where:{classSectionId:{in:ids}}});let count=0;
   for(const s of plan.sections)count+=await endCourseMemberships(tx,{...s,closedAt:new Date(s.closedAt)},actor.actor_user_id,requestId,null,{next:uuidv7},audit,outbox);
   assert.equal(await tx.enrollment.count({where:{classSectionId:{in:ids},status:'ACTIVE'}}),0);assert.equal(await tx.exerciseRecord.count({where:{classSectionId:{in:ids}}}),recordsBefore);
   return {count,recordsRetained:recordsBefore};
  },{isolationLevel:'Serializable',timeout:30000});
  console.log(JSON.stringify({check:'COURSE_CLOSURE_REPAIR_APPLIED',result:'PASS',...removed,requestId}));
 }
}catch(error){console.error(JSON.stringify({check:'COURSE_CLOSURE_REPAIR',result:'FAIL',type:error.name,code:error.code}));process.exitCode=1;}finally{await db.$disconnect();}
