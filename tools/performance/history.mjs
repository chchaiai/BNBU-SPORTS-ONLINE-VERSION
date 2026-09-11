// Synthetic database fixtures for representative list/aggregate sizes; not real exercise evidence.
import assert from 'node:assert/strict';import fs from 'node:fs';import {v7 as id} from 'uuid';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
await loadRuntimeSecrets(process.env);const c=validateEnvironment(process.env).RUNTIME_CONFIG;assert.equal(c.appEnvironment,'production');
const db=new PrismaService(c),state=JSON.parse(fs.readFileSync('/perf/private.json')),f=state.fixture;
try{
 const org=await db.organization.findUniqueOrThrow({where:{id:f.organizationId}});assert.ok(org.organizationCode.startsWith('BNBU-TEST-PERF-'));assert.equal(state.students.length,200);
 let inserted=0;
 for(const s of state.students){
  const existing=await db.exerciseRecord.count({where:{organizationId:org.id,studentId:s.studentId}});
  if(existing===10)continue;assert.equal(existing,0,'Refuse unexpected partial fixture');
  await db.$transaction(async tx=>{
   for(let n=0;n<10;n++){
    const start=new Date(Date.UTC(2026,7,3+n*3,4,0,0)),end=new Date(+start+1800000),day=new Date(Date.UTC(2026,7,3+n*3));
    const sessionId=id(),recordId=id(),valid=n<8;
    await tx.exerciseSession.create({data:{id:sessionId,organizationId:org.id,studentId:s.studentId,enrollmentId:s.enrollmentId,classSectionId:f.teacherAActiveSectionId,semesterId:f.semesterId,startedByAuthSessionId:s.authSessionId,status:'COMPLETED',startedAt:start,businessDate:day,completedAt:end,endReason:'USER_COMPLETED',actualDurationSeconds:1800n,pausedDurationSeconds:0n,createdAt:start,updatedAt:end}});
    await tx.exerciseRecord.create({data:{id:recordId,organizationId:org.id,semesterId:f.semesterId,studentId:s.studentId,enrollmentId:s.enrollmentId,classSectionId:f.teacherAActiveSectionId,courseId:f.activeCourseId,teacherId:f.teacherProfileId,sessionId,businessDate:day,creditType:n%2?'GENERAL':'COURSE_RELATED',sportType:'RUNNING',description:'Synthetic capacity fixture; not actual exercise evidence',actualDurationSeconds:1800n,pausedDurationSeconds:0n,creditedDurationSeconds:valid?1800n:0n,status:valid?'REVIEWED':'SUBMITTED',submittedAt:end,clientRequestId:'perf-'+recordId,version:2,createdAt:start,updatedAt:end}});
    await tx.reviewRecord.create({data:{id:id(),organizationId:org.id,recordId,reviewVersion:1,result:valid?'VALID':'PENDING',reviewedAt:valid?end:null,createdAt:end}});
    await tx.v81RecordWorkflow.create({data:{recordId,organizationId:org.id,stage:valid?'VALID':'PENDING_TEACHER',teacherRoundStartedAt:end,publicComment:'Synthetic capacity fixture',updatedAt:end}});
    await tx.v81CreditProjection.create({data:{recordId,organizationId:org.id,eligibleMinutes:30,creditedMinutes:valid?30:0,selected:valid,reason:'SYNTHETIC_CAPACITY_FIXTURE',updatedAt:end}});
   }
  },{timeout:10000});
  inserted+=10;
 }
 console.log(JSON.stringify({mode:'history',inserted,total:await db.exerciseRecord.count({where:{organizationId:org.id}}),perStudent:10,synthetic:true}));
}finally{await db.$disconnect();}
