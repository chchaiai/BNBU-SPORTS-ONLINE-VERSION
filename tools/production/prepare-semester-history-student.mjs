import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {v7 as uuidv7} from 'uuid';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
const f=JSON.parse(readFileSync('/acceptance/semester-history-fixture.json')).fixture;
assert.equal(f.organizationId,'01a09918-10d0-75ae-93a0-a4bf948d2495');
const destination='/acceptance/semester-history-student.json';assert.ok(!existsSync(destination));
await loadRuntimeSecrets(process.env);const config=validateEnvironment(process.env).RUNTIME_CONFIG;assert.equal(config.appEnvironment,'production');
const db=new PrismaService(config);
try {
 const result=await db.$transaction(async tx=>{
  assert.equal(await tx.enrollment.count({where:{organizationId:f.organizationId}}),0);
  assert.equal(await tx.user.count({where:{organizationId:f.organizationId,status:'ACTIVE'}}),0);
  const section=await tx.classSection.findUniqueOrThrow({where:{id:f.teacherAActiveSectionId}});
  assert.equal(section.organizationId,f.organizationId);assert.equal(section.semesterId,f.semesterId);
  const unused=await tx.classSection.findMany({where:{organizationId:f.organizationId,semesterId:f.semesterId,id:{not:f.teacherAActiveSectionId}},select:{id:true}});
  assert.equal(await tx.exerciseRecord.count({where:{classSectionId:{in:unused.map(s=>s.id)}}}),0);
  await tx.classSection.updateMany({where:{id:{in:unused.map(s=>s.id)},organizationId:f.organizationId},data:{semesterId:f.archivedSemesterId}});
  const now=new Date(),userId=uuidv7(),studentId=uuidv7(),enrollmentId=uuidv7();
  const email='semester.history.'+Date.now()+'@bnbu.invalid';
  await tx.user.create({data:{id:userId,organizationId:f.organizationId,role:'STUDENT',status:'DISABLED',primaryEmail:email,primaryEmailNormalized:email,emailVerifiedAt:now,createdAt:now,updatedAt:now}});
  await tx.studentProfile.create({data:{id:studentId,organizationId:f.organizationId,userId,studentNumber:'9900000099',fullName:'TEST SEMESTER HISTORY',gender:'MALE',gradeYear:2026,status:'ACTIVE',createdAt:now,updatedAt:now}});
  await tx.enrollment.create({data:{id:enrollmentId,organizationId:f.organizationId,semesterId:f.semesterId,classSectionId:f.teacherAActiveSectionId,studentId,source:'MANUAL',status:'ACTIVE',joinedAt:now,createdBy:f.teacherUserId,updatedBy:f.teacherUserId,createdAt:now,updatedAt:now}});
  assert.equal(await tx.classSection.count({where:{organizationId:f.organizationId,semesterId:f.semesterId}}),1);
  return {organizationId:f.organizationId,sectionId:f.teacherAActiveSectionId,userId,studentId,enrollmentId,studentNumber:'9900000099',fullName:'TEST SEMESTER HISTORY',unusedSectionsMoved:unused.length,scope:'Synthetic setup only; email verification is seeded, not mail acceptance; user disabled and no session created'};
 },{timeout:30000});
 writeFileSync(destination,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({result:'PASS',...result}));
}finally{await db.$disconnect();}
