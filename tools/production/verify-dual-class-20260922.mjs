import assert from 'node:assert/strict';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
import {UsersService} from '/app/dist/modules/users/users.service.js';
import {readEnrollmentCapacity} from '/app/dist/modules/enrollments/application/enrollment-capacity.js';
await loadRuntimeSecrets(process.env);const config=validateEnvironment(process.env).RUNTIME_CONFIG;
assert.equal(config.appEnvironment,'production');assert.equal(config.publicOrganizationCode,'BNBU');const db=new PrismaService(config);
try {
 const result=await db.$transaction(async tx=>{
  await tx.$executeRaw`SET TRANSACTION READ ONLY`;
  const s=await tx.studentProfile.findUniqueOrThrow({where:{id:'01a0a385-8409-7546-829a-84d121b8da4c'}});
  const u=await tx.user.findUniqueOrThrow({where:{id:s.userId}});assert.equal(u.primaryEmailNormalized,'s230025090@mail.bnbu.edu.cn');assert.equal(s.fullName,'杨昊忻');
  const profile=await new UsersService(tx,null).current({organizationId:s.organizationId,userId:s.userId,role:'STUDENT',sessionId:'read-only-verification'});
  assert.equal(profile.studentProfile.maximumActiveEnrollments,2);
  const classes=await tx.enrollment.findMany({where:{studentId:s.id,status:'ACTIVE'},select:{id:true,classSectionId:true,semesterId:true}});assert.ok(classes.length>=1 && classes.length<=2);
  const [grant]=await tx.$queryRaw`SELECT maximum_active FROM student_enrollment_capacities WHERE organization_id=${s.organizationId}::uuid AND student_id=${s.id}::uuid AND semester_id=${classes[0].semesterId}::uuid`;assert.equal(grant.maximum_active,2);
  const peer=await tx.studentProfile.findFirstOrThrow({where:{organizationId:s.organizationId,id:{not:s.id},deletedAt:null}});
  assert.equal(await readEnrollmentCapacity(tx,s.organizationId,peer.id),1);
  const [grants]=await tx.$queryRaw`SELECT count(*)::int AS count FROM student_enrollment_capacities WHERE organization_id=${s.organizationId}::uuid`;assert.equal(grants.count,1);
  const [trigger]=await tx.$queryRaw`SELECT count(*)::int AS count FROM pg_trigger WHERE tgname='enrollments_capacity_guard' AND tgenabled='O'`;assert.equal(trigger.count,1);
  return {result:'PASS',studentId:s.id,maximumActive:2,classes,ordinaryStudentMaximum:1,scopedGrantCount:1,databaseGuard:true,records:await tx.exerciseRecord.count({where:{studentId:s.id}}),productionBusinessWrites:0};
 });console.log(JSON.stringify(result));
}finally{await db.$disconnect()}
