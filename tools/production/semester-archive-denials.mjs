import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {v7 as uuidv7} from 'uuid';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
import {TokenService} from '/app/dist/modules/auth/token.service.js';
const f=JSON.parse(readFileSync('/acceptance/semester-history-fixture.json')).fixture,s=JSON.parse(readFileSync('/acceptance/semester-history-student.json'));
assert.equal(f.organizationId,'01a09918-10d0-75ae-93a0-a4bf948d2495');
const destination='/acceptance/semester-archive-denials-v2.json';assert.ok(!existsSync(destination));
await loadRuntimeSecrets(process.env);const config=validateEnvironment(process.env).RUNTIME_CONFIG;assert.equal(config.appEnvironment,'production');
const db=new PrismaService(config),checks=[],tokens={};
try{
 assert.equal((await db.semester.findUniqueOrThrow({where:{id:f.semesterId}})).status,'ARCHIVED');
 assert.equal((await db.classSection.findUniqueOrThrow({where:{id:s.sectionId}})).status,'ACTIVE');
 for(const [role,id] of [['STUDENT',s.userId],['TEACHER',f.teacherUserId]]){
  const now=new Date(),sessionId=uuidv7();
  const user=await db.$transaction(async tx=>{
   const old=await tx.user.findUniqueOrThrow({where:{id}});assert.equal(old.organizationId,f.organizationId);assert.equal(old.status,'DISABLED');
   const u=await tx.user.update({where:{id},data:{status:'ACTIVE'}});
   await tx.authSession.create({data:{id:sessionId,organizationId:f.organizationId,userId:id,status:'ACTIVE',tokenFamilyId:uuidv7(),createdAt:now,lastSeenAt:now,absoluteExpiresAt:new Date(+now+600000),idleExpiresAt:new Date(+now+600000)}});return u;
  });
  tokens[role]=(await new TokenService(config,{now:()=>new Date()},{next:uuidv7}).issue({userId:id,organizationId:f.organizationId,role,sessionId,tokenVersion:user.tokenVersion})).token;
 }
 const before=await db.exerciseSession.count({where:{classSectionId:s.sectionId}});
 for(const [role,path,body,code] of [
  ['STUDENT','/exercise-sessions',{enrollmentId:s.enrollmentId,clientObservedAt:new Date().toISOString()},'CONFLICT_STATE_TRANSITION'],
  ['TEACHER',`/class-sections/${s.sectionId}/makeup-windows`,{enrollmentId:s.enrollmentId,expectedRuleVersion:1,startsAt:new Date().toISOString(),endsAt:new Date(Date.now()+3600000).toISOString()},'CONFLICT_STATE_TRANSITION']
 ]){
  const response=await fetch('https://www.teacher.bnbusports.cn/api/v1'+path,{method:'POST',headers:{authorization:'Bearer '+tokens[role],'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const value=await response.json();assert.equal(response.status,409,JSON.stringify({path,status:response.status,code:value.code}));assert.equal(value.code,code);checks.push({role,path,status:response.status,code:value.code});
 }
 assert.equal(await db.exerciseSession.count({where:{classSectionId:s.sectionId}}),before);
 const windows=await db.$queryRaw`SELECT count(*)::int AS count FROM v81_makeup_windows WHERE class_section_id=${s.sectionId}::uuid`;
 assert.equal(windows[0].count,0);
}finally{
 await db.user.updateMany({where:{id:{in:[s.userId,f.teacherUserId]},organizationId:f.organizationId},data:{status:'DISABLED',tokenVersion:{increment:1}}});
 const result={organizationId:f.organizationId,checks,passed:checks.length===2,accountsDisabled:true,scope:'Settled archived course rejects new exercise and teacher makeup; exercise hits settlement guard before archive time guard'};
 writeFileSync(destination,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(result));await db.$disconnect();
}
