import assert from 'node:assert/strict';
import fs from 'node:fs';
const cloud=process.env.BNBU_CASCADE_CLOUD==='1';let db;
if(cloud){const{loadRuntimeSecrets}=await import('/app/dist/common/config/file-json-secret-loader.js');await loadRuntimeSecrets(process.env);const{validateEnvironment}=await import('/app/dist/common/config/environment.js'),{PrismaService}=await import('/app/dist/common/database/prisma.service.js');const c=validateEnvironment(process.env).RUNTIME_CONFIG;assert.equal(c.appEnvironment,'production');db=new PrismaService(c);}
else{const{createTestPrisma}=await import('/workspace/backend/test/helpers/database.ts');const url=new URL('postgresql://sql-postgres:5432/v81_browser_test');url.username=process.env.PGUSER;url.password=process.env.PGPASSWORD;db=createTestPrisma(url.href);}
try{
 const f=JSON.parse(fs.readFileSync((cloud?'/acceptance':'/workspace/.browser-state')+'/teacher-cascade-private.json'));
 const org=await db.organization.findUniqueOrThrow({where:{id:f.fixture.organizationId}});assert.ok(org.organizationCode.includes('-TCASCADE-'));
 const ids=f.students.map(s=>s.studentId),users=f.students.map(s=>s.userId);
 const remaining={teacher:await db.teacherProfile.count({where:{id:f.teacher.id}}),teacherUser:await db.user.count({where:{id:f.teacher.userId}}),
 students:await db.studentProfile.count({where:{id:{in:ids}}}),users:await db.user.count({where:{id:{in:users}}}),
 enrollments:await db.enrollment.count({where:{studentId:{in:ids}}}),records:await db.exerciseRecord.count({where:{studentId:{in:ids}}}),
 media:await db.mediaEvidence.count({where:{ownerStudentId:{in:ids}}}),scores:await db.studentScore.count({where:{studentId:{in:ids}}})};assert.ok(Object.values(remaining).every(n=>n===0));
 const sections=await db.classSection.findMany({where:{teacherId:f.teacher.id}});assert.ok(sections.length>0);assert.ok(sections.every(s=>['CLOSED','ARCHIVED'].includes(s.status)&&!s.isEnrollmentOpen));
 assert.equal((await db.classSection.findUniqueOrThrow({where:{id:f.fixture.teacherBActiveSectionId}})).status,'ACTIVE');
 assert.equal(await db.studentProfile.count({where:{id:f.peer.studentId}}),1);assert.equal((await db.enrollment.findUniqueOrThrow({where:{id:f.peer.enrollmentId}})).status,'ACTIVE');
 const [events]=await db.$queryRaw`SELECT count(*)::integer n FROM v81_events WHERE resource_id=${f.teacher.id}::uuid AND event_type='ACCOUNT_DELETED'`;assert.equal(events.n,1);
 console.log(JSON.stringify({check:'TEACHER_CASCADE_DATABASE',environment:cloud?'cloud':'local',result:'PASS',remaining,closedOrArchivedCourses:sections.length,otherCourseRetained:true,peerRetained:true,teacherAuditCount:events.n}));
 const disabled=await db.user.updateMany({where:{organizationId:{in:[f.fixture.organizationId,f.fixture.isolationOrganizationId]},status:'ACTIVE'},data:{status:'DISABLED',tokenVersion:{increment:1}}});
 console.log(JSON.stringify({check:'TEACHER_CASCADE_TEST_ACCOUNTS_DISABLED',result:'PASS',count:disabled.count}));
}finally{await db.$disconnect();}
