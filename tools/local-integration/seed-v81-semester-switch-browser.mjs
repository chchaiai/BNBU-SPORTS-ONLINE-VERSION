import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {createRequire} from 'node:module';
import {createTestPrisma,seedFoundationFixture} from '../../backend/test/helpers/database.ts';
import {seedExerciseSessionStudent} from '../../backend/test/helpers/exercise-session.ts';
import {TEST_PASSWORD} from '../../backend/test/helpers/test-environment.ts';
const uuidv7=createRequire(new URL('../../backend/package.json',import.meta.url))('uuid').v7;
const fixtureName=process.env.V81_SEMESTER_FIXTURE??'semester-switch-browser';assert.match(fixtureName,/^[a-z0-9-]+$/);
const file=`/workspace/.browser-state/${fixtureName}.json`,url=new URL('postgresql://sql-postgres:5432/v81_browser_test');url.username=process.env.PGUSER;url.password=process.env.PGPASSWORD;
const prisma=createTestPrisma(url.href);let state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{database:'v81_browser_test'};
const save=()=>fs.writeFileSync(file,JSON.stringify(state,null,2),{mode:0o600});
const api=async(path,token,body)=>{const response=await fetch('http://127.0.0.1:3199/api/v1'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','idempotency-key':randomUUID(),...(token?{authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw new Error(`${path}: ${response.status} ${result.error?.code??result.code}`);return result.data;};
try{
 assert.equal(state.database,'v81_browser_test');assert.equal((await prisma.$queryRaw`SELECT current_database() AS name`)[0].name,'v81_browser_test');
 if(!state.fixture){state.fixture=await seedFoundationFixture(prisma,'SWITCH'+randomUUID().slice(0,8).toUpperCase());state.accounts={admin:{email:state.fixture.adminEmail,password:'Switch-'+randomUUID()+'A7!'},teacher:{email:state.fixture.teacherEmail,password:'Switch-'+randomUUID()+'A7!'}};save();}
 const fixture=state.fixture,id=fixture.teacherAActiveSectionId,now=new Date();
 assert.ok((await prisma.organization.findUniqueOrThrow({where:{id:fixture.organizationId}})).organizationCode.startsWith('BNBU-TESTSWITCH'));
 if(!state.configured){
  await prisma.$transaction(async tx=>{
   await tx.classSection.updateMany({where:{organizationId:fixture.organizationId,semesterId:fixture.semesterId,id:{not:id}},data:{semesterId:fixture.archivedSemesterId,isEnrollmentOpen:false,checkInWindowMode:'UNAVAILABLE',checkInStartDate:null,checkInEndDate:null,dailyStartTime:null,dailyEndTime:null,submissionDeadlineAt:null}});
   await tx.classSection.update({where:{id},data:{checkInWindowMode:'UNAVAILABLE',checkInStartDate:null,checkInEndDate:null,dailyStartTime:null,dailyEndTime:null,submissionDeadlineAt:null}});
   await tx.semester.update({where:{id:fixture.semesterId},data:{endDate:new Date('2026-09-08'),displayName:'Synthetic settled old semester'}});
   await tx.$executeRaw`INSERT INTO v81_admin_access(user_id,organization_id,kind) VALUES(${fixture.adminUserId}::uuid,${fixture.organizationId}::uuid,'SUPER') ON CONFLICT DO NOTHING`;
  });state.configured=true;save();
 }
 if(!state.calendarAligned){await prisma.semester.update({where:{id:fixture.semesterId,status:'CURRENT'},data:{academicYear:'2025-2026',termCode:'SUMMER'}});state.calendarAligned=true;save();}
 const tokens={};for(const role of ['admin','teacher']){const account=state.accounts[role];let login;
  try{login=await api('/auth/password-login',null,{account:account.email,password:account.password});}
  catch{login=await api('/auth/password-login',null,{account:account.email,password:TEST_PASSWORD});const security=await api('/auth/account-security',login.accessToken);await api('/auth/own-password',login.accessToken,{currentPassword:TEST_PASSWORD,newPassword:account.password,confirmPassword:account.password,expectedVersion:security.version});}
  tokens[role]=(await api('/auth/password-login',null,{account:account.email,password:account.password})).accessToken;
 }
 if(!state.student){state.student=await seedExerciseSessionStudent(prisma,fixture,randomUUID().slice(0,8).toUpperCase(),'ACTIVE',false);save();}
 await prisma.studentProfile.update({where:{id:state.student.studentId},data:{gender:'MALE'}});
 const profile=await prisma.studentProfile.findUniqueOrThrow({where:{id:state.student.studentId}});
 if(!state.importId){const importId=uuidv7();await prisma.$transaction(async tx=>{
  await tx.officialRosterImport.create({data:{id:importId,organizationId:fixture.organizationId,classSectionId:id,versionNumber:1,source:'FILE',fileName:'synthetic-semester-switch.csv',sourceFileStorageKey:'synthetic/semester-switch.csv',fileChecksumSha256:'b'.repeat(64),fieldMappingSnapshot:{studentNumber:'student_number',fullName:'full_name'},status:'RECEIVED',importedBy:fixture.teacherUserId,importedAt:now,createdAt:now,isCurrent:false}});
  await tx.officialRosterImport.update({where:{id:importId},data:{status:'VALIDATING',version:{increment:1}}});
  await tx.officialRosterEntry.create({data:{id:uuidv7(),organizationId:fixture.organizationId,rosterImportId:importId,classSectionId:id,sourceRowNumber:2,normalizedStudentNumber:profile.studentNumber,rawStudentNumberSafe:profile.studentNumber,fullName:profile.fullName,rowValidationStatus:'VALID',rowErrorCodes:[],rawRowSnapshotSafe:{},createdAt:now}});
  await tx.officialRosterImport.update({where:{id:importId},data:{status:'VALIDATED',totalRowCount:1,validRowCount:1,isCurrent:true,version:{increment:1}}});
 });state.importId=importId;save();}
 const templates=await api('/rule-templates',tokens.admin),template=templates.items[0]??await api('/rule-templates',tokens.admin,{displayName:'Synthetic switch rules',expectedVersion:0});
 if(!state.rulesReady){await prisma.$executeRaw`INSERT INTO v81_course_rules(class_section_id,organization_id,minimum_minutes,weekly_limit,course_target,general_target,regular_deadline,closing_deadline,settlement_planned_at,published_at,version,template_id)
 VALUES(${id}::uuid,${fixture.organizationId}::uuid,30,4,600,600,'2026-08-31T15:59:59Z'::timestamptz,'2026-09-07T15:59:59Z'::timestamptz,'2026-09-07T16:00:00Z'::timestamptz,${new Date()},1,${template.id}::uuid) ON CONFLICT DO NOTHING`;state.rulesReady=true;save();}
 if(!state.rosterConfirmed){const source=await prisma.officialRosterImport.findUniqueOrThrow({where:{id:state.importId}});await api(`/roster-imports/${state.importId}/confirmation`,tokens.teacher,{expectedVersion:source.version});state.rosterConfirmed=true;save();}
 if(!(await api(`/enrollments/${state.student.enrollmentId}/physical-results`,tokens.teacher)).items.length)await api(`/enrollments/${state.student.enrollmentId}/physical-results`,tokens.teacher,{expectedVersion:0,runType:'1000m',elapsedSeconds:270,testedOn:'2026-09-07'});
 if(!(await api(`/enrollments/${state.student.enrollmentId}/final-grades`,tokens.teacher)).items.length)await api(`/enrollments/${state.student.enrollmentId}/final-grades`,tokens.teacher,{expectedVersion:0,finalGrade:80,published:true});
 console.log('SYNTHETIC_NONEMPTY_SEMESTER_SWITCH_PREREQUISITES_READY');
}finally{await prisma.$disconnect();}
