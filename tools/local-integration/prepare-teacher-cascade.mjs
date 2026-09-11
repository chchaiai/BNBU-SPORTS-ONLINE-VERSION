import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
const cloud=process.env.BNBU_CASCADE_CLOUD==='1',root=cloud?'/app':'/workspace/backend';
const require=createRequire(root+'/package.json'),{hash,argon2id}=require('argon2'),{v7:uuidv7}=require('uuid');
let db,seedFoundationFixture,seedExerciseSessionStudent;
if(cloud){
 const {loadRuntimeSecrets}=await import('/app/dist/common/config/file-json-secret-loader.js');await loadRuntimeSecrets(process.env);
 const {validateEnvironment}=await import('/app/dist/common/config/environment.js'),{PrismaService}=await import('/app/dist/common/database/prisma.service.js');
 const config=validateEnvironment(process.env).RUNTIME_CONFIG;assert.equal(config.appEnvironment,'production');db=new PrismaService(config);
 ({seedFoundationFixture,seedExerciseSessionStudent}=await import('/app/production-smoke-helpers.mjs'));
}else{
 const helpers=await import('/workspace/backend/test/helpers/database.ts');seedFoundationFixture=helpers.seedFoundationFixture;
 ({seedExerciseSessionStudent}=await import('/workspace/backend/test/helpers/exercise-session.ts'));
 const url=new URL('postgresql://sql-postgres:5432/v81_browser_test');url.username=process.env.PGUSER;url.password=process.env.PGPASSWORD;db=helpers.createTestPrisma(url.href);
 assert.equal((await db.$queryRaw`SELECT current_database() name`)[0].name,'v81_browser_test');
}
let fixture;
try{
 fixture=await seedFoundationFixture(db,'-TCASCADE-'+Date.now().toString(36).toUpperCase());
 const password=randomBytes(30).toString('base64url'),passwordHash=await hash(password,{type:argon2id});
 await db.user.updateMany({where:{id:{in:[fixture.adminUserId,fixture.teacherUserId,fixture.teacherBUserId]}},data:{passwordHash}});
 await db.v81AccountSecurity.createMany({data:[fixture.adminUserId,fixture.teacherUserId,fixture.teacherBUserId].map(userId=>({userId,organizationId:fixture.organizationId,mustChangePassword:false,passwordChangedAt:new Date()}))});
 await db.v81AdminAccess.create({data:{userId:fixture.adminUserId,organizationId:fixture.organizationId,kind:'SUPER',permissions:[],mustChangePassword:false}});
 const students=[];
 for(let i=0;i<3;i++)students.push(await seedExerciseSessionStudent(db,fixture,randomUUID().slice(0,8).toUpperCase(),'ACTIVE',false));
 // The first targeted student also belongs to the other teacher's course.
 const source=await db.enrollment.findUniqueOrThrow({where:{id:students[0].enrollmentId}});
 await db.enrollment.create({data:{...source,id:uuidv7(),classSectionId:fixture.teacherBArchivedSectionId,
   semesterId:fixture.archivedSemesterId,status:'REMOVED',endedAt:new Date(),endReason:'Synthetic previous-semester course'}});
 const peer=await seedExerciseSessionStudent(db,{...fixture,teacherAActiveSectionId:fixture.teacherBActiveSectionId},randomUUID().slice(0,8).toUpperCase(),'ACTIVE',false);
 const teacher=await db.teacherProfile.findUniqueOrThrow({where:{id:fixture.teacherProfileId}});
 const section=await db.classSection.findUniqueOrThrow({where:{id:fixture.teacherAActiveSectionId}});assert.equal(section.status,'ACTIVE');
 const file=(cloud?'/acceptance':'/workspace/.browser-state')+'/teacher-cascade-private.json';
 fs.writeFileSync(file,JSON.stringify({fixture,students,peer,teacher,admin:{email:fixture.adminEmail,password},teacherLogin:{email:(await db.user.findUniqueOrThrow({where:{id:fixture.teacherUserId}})).primaryEmail,password}}),{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({check:'TEACHER_CASCADE_FIXTURE',result:'PASS',organizationId:fixture.organizationId,students:students.length,crossTeacherMembership:true,unrelatedPeer:true,courseStatus:section.status}));
}catch(error){if(fixture)await db.user.updateMany({where:{organizationId:{in:[fixture.organizationId,fixture.isolationOrganizationId]}},data:{status:'DISABLED',tokenVersion:{increment:1}}});throw error;}finally{await db.$disconnect();}
