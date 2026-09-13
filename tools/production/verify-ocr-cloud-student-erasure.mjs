// Read-only verification of synthetic student erasure and the other student's preservation.
import assert from 'node:assert/strict';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
await loadRuntimeSecrets(process.env);const db=new PrismaService(validateEnvironment(process.env).RUNTIME_CONFIG);
const organizationId='01a096c2-20a2-706b-8c69-802f67dee12c',studentId='01a096c2-21dc-762b-8c7c-7889c687418b';
try{const result=await db.$transaction(async tx=>{
 await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
 assert.equal(await tx.studentProfile.findUnique({where:{id:studentId}}),null);
 const remaining=await tx.studentProfile.findMany({where:{organizationId},select:{studentNumber:true}});assert.deepEqual(remaining,[{studentNumber:'9900000002'}]);
 const sessions=await tx.exerciseSession.count({where:{studentId}}),records=await tx.exerciseRecord.count({where:{studentId}}),memberships=await tx.enrollment.count({where:{studentId}});
 assert.equal(sessions,0);assert.equal(records,0);assert.equal(memberships,0);
 const history=await tx.exerciseSession.findUnique({where:{id:'01a096d7-60b2-7175-b9d5-c418ecb5c16d'}});assert.equal(history,null);
 const apps=await tx.exemptionApplication.count({where:{organizationId}});assert.equal(apps,0);
 return {erasedStudentAbsent:true,otherSyntheticStudentsPreserved:remaining.length,sessions,records,memberships,applications:apps,retiredCourseHistoryRemovedWithStudent:true};
 });console.log(JSON.stringify({check:'CLOUD_STUDENT_ERASURE_DATABASE_READ_ONLY',observedAt:new Date().toISOString(),status:'PASS',organizationId,...result}));
}finally{await db.$disconnect();}
