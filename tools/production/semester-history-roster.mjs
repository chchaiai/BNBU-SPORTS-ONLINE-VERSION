import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {v7 as uuidv7} from 'uuid';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
import {TokenService} from '/app/dist/modules/auth/token.service.js';
const f=JSON.parse(readFileSync('/acceptance/semester-history-fixture.json')).fixture;
const s=JSON.parse(readFileSync('/acceptance/semester-history-student.json'));
assert.equal(f.organizationId,'01a09918-10d0-75ae-93a0-a4bf948d2495');
const destination='/acceptance/semester-history-roster.json';assert.ok(!existsSync(destination));
await loadRuntimeSecrets(process.env);const config=validateEnvironment(process.env).RUNTIME_CONFIG;assert.equal(config.appEnvironment,'production');
const db=new PrismaService(config),checks=[];let token,roster;
async function api(path,body,status=body?201:200){
 const form=body instanceof FormData;
 const response=await fetch('https://www.teacher.bnbusports.cn/api/v1'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,'idempotency-key':randomUUID(),...(!form?{'content-type':'application/json'}:{})},...(body?{body:form?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 const result=await response.json();assert.equal(response.status,status,JSON.stringify({path,status:response.status,code:result.code}));return result.data;
}
try {
 const now=new Date(),sessionId=uuidv7();
 const teacher=await db.$transaction(async tx=>{
  const existing=await tx.user.findUniqueOrThrow({where:{id:f.teacherUserId}});assert.equal(existing.organizationId,f.organizationId);assert.equal(existing.status,'DISABLED');
  const user=await tx.user.update({where:{id:f.teacherUserId},data:{status:'ACTIVE'}});
  await tx.v81AccountSecurity.upsert({where:{userId:user.id},create:{userId:user.id,organizationId:f.organizationId,mustChangePassword:false,passwordChangedAt:now},update:{}});
  await tx.authSession.create({data:{id:sessionId,organizationId:f.organizationId,userId:user.id,status:'ACTIVE',tokenFamilyId:uuidv7(),createdAt:now,lastSeenAt:now,absoluteExpiresAt:new Date(+now+600000),idleExpiresAt:new Date(+now+600000)}});
  return user;
 });
 token=(await new TokenService(config,{now:()=>new Date()},{next:uuidv7}).issue({userId:teacher.id,organizationId:f.organizationId,role:'TEACHER',sessionId,tokenVersion:teacher.tokenVersion})).token;
 assert.equal((await api('/me')).user.organizationId,f.organizationId);
 const bytes=Buffer.from(`studentNumber,fullName,gender,gradeYear\n${s.studentNumber},${s.fullName},MALE,2026\n`),form=new FormData();
 form.set('source','FILE');form.set('fileFormat','CSV');form.set('fieldMappingSnapshot',JSON.stringify({studentNumber:'studentNumber',fullName:'fullName',gender:'gender',gradeYear:'gradeYear',collegeName:null,majorName:null,administrativeClassName:null}));form.set('file',new Blob([bytes],{type:'text/csv'}),'synthetic-semester-history.csv');
 roster=await api(`/class-sections/${s.sectionId}/roster-imports`,form);checks.push('REAL_COS_ROSTER_UPLOAD');
 const original=await api(`/roster-imports/${roster.id}/source`);assert.ok(Buffer.from(original.fileBase64,'base64').equals(bytes));checks.push('SOURCE_BYTES_IDENTICAL');
 await api(`/roster-imports/${roster.id}/confirmation`,{expectedVersion:roster.version});checks.push('FORMAL_ROSTER_CONFIRMED');
 await api(`/enrollments/${s.enrollmentId}/physical-results`,{runType:'1000m',elapsedSeconds:300,testedOn:'2026-09-13',expectedVersion:0});checks.push('PHYSICAL_RESULT_SAVED');
} finally {
 await db.user.update({where:{id:f.teacherUserId},data:{status:'DISABLED',tokenVersion:{increment:1}}});
 const result={checks,rosterId:roster?.id,organizationId:f.organizationId,sectionId:s.sectionId,teacherDisabled:true,passed:checks.length===4};
 writeFileSync(destination,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(result));await db.$disconnect();
}
