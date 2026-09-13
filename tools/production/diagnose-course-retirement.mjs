// Reproduce the database operations inside an always-rolled-back transaction.
import {randomUUID} from 'node:crypto';
import {loadRuntimeSecrets} from './dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from './dist/common/config/environment.js';
import {PrismaService} from './dist/common/database/prisma.service.js';
import {retireCourseMemberships} from './dist/modules/v8/v81-retain-course-history.js';
await loadRuntimeSecrets(process.env);
const db=new PrismaService(validateEnvironment(process.env).RUNTIME_CONFIG);
const rollback=new Error('DIAGNOSTIC_ROLLBACK');
try {
 const sections=await db.classSection.findMany({where:{displayName:process.argv[2],retiredAt:null},take:10});
 for(const section of sections) {
  let step='memberships';
  try {
   await db.$transaction(async tx=>{
    const teacher=await tx.teacherProfile.findUniqueOrThrow({where:{id:section.teacherId}});
    const principal={organizationId:section.organizationId,userId:teacher.userId,role:'TEACHER'};
    await retireCourseMemberships(tx,principal,section.id,new Date(),randomUUID());
    step='section';
    await tx.classSection.update({where:{id:section.id},data:{status:'CLOSED',isEnrollmentOpen:false,closedAt:section.closedAt??new Date(),closedBy:teacher.userId,closeReason:'Diagnostic rollback',retiredAt:new Date(),updatedBy:teacher.userId,version:{increment:1}}});
    step='deferred constraints';await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
    throw rollback;
   },{timeout:30000});
  } catch(error) {
   const message=String(error.message).split('Database error.').pop();
   console.log(JSON.stringify({check:'COURSE_RETIREMENT_ROLLBACK_DIAGNOSIS',step,result:error===rollback?'OPERATIONS_PASSED_ROLLED_BACK':'FAILED_ROLLED_BACK',code:error.code??null,
    detail:error===rollback?null:message.replace(/[a-z]+:\/\/\S+|[\w.+-]+@[\w.-]+|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi,'[REDACTED]').slice(-1600)}));
  }
 }
}finally{await db.$disconnect();}
