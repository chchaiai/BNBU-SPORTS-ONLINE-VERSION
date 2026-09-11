// Synthetic historical prerequisites only; never run against a cloud or user database.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const uuidv7=createRequire(new URL('../../backend/package.json',import.meta.url))('uuid').v7;
import { createTestPrisma } from '../../backend/test/helpers/database.ts';
import { seedExerciseSessionStudent } from '../../backend/test/helpers/exercise-session.ts';
const directory='/workspace/.browser-state';
const state=JSON.parse(fs.readFileSync(`${directory}/state.json`));
assert.equal(state.database,'v81_browser_test');
const url=new URL('postgresql://sql-postgres:5432/v81_browser_test');url.username=process.env.PGUSER;url.password=process.env.PGPASSWORD;
const prisma=createTestPrisma(url.href);
try {
 assert.equal((await prisma.$queryRaw`SELECT current_database() AS name`)[0].name,'v81_browser_test');
 const gradeVariant=process.env.V81_SETTLEMENT_FIXTURE_VARIANT==='final-grade';
 const fixturePrefix=gradeVariant?'Synthetic Grade Settlement Browser ':'Synthetic Settlement Browser ';
 const target=`${directory}/${gradeVariant?'grade-settlement-browser':'settlement-browser'}.json`;
 // Preserve the two failed prerequisite attempts; UUIDv4 cannot be queried by the UUIDv7 enrollment contract.
 for(const failedId of ['f28b3253-9077-47b9-a382-5d945d54dfbb','43d1ddf5-3bd5-487d-bacb-386133c51dae']) {
  await prisma.classSection.updateMany({where:{id:failedId,organizationId:state.fixture.organizationId,createdBy:state.fixture.teacherUserId,displayName:{startsWith:'Synthetic Settlement Browser '},status:'ACTIVE'},data:{status:'CLOSED',closedAt:new Date(),closedBy:state.fixture.teacherUserId,closeReason:'Synthetic prerequisite UUIDv4 attempt retained; replaced by UUIDv7 fixture',version:{increment:1}}});
 }
 if(fs.existsSync(target)&&JSON.parse(fs.readFileSync(target)).id==='43d1ddf5-3bd5-487d-bacb-386133c51dae')fs.renameSync(target,`${directory}/settlement-browser-v4-prerequisites.json`);
 if(fs.existsSync(target)){console.log('SYNTHETIC_SETTLEMENT_FIXTURE_ALREADY_PRESENT');process.exitCode=0;}
 else {
  const fixture=state.fixture, now=new Date();
  const existing=await prisma.classSection.findFirst({where:{organizationId:fixture.organizationId,createdBy:fixture.teacherUserId,status:'ACTIVE',displayName:{startsWith:fixturePrefix}},orderBy:{createdAt:'desc'}});
  const id=existing?.id??uuidv7(), name=existing?.displayName??`${fixturePrefix}${id}`;
  const section=await prisma.classSection.findUniqueOrThrow({where:{id:fixture.teacherAActiveSectionId}});
  if(!existing)await prisma.classSection.create({data:{...section,id,displayName:name,classCode:`SETTLE-${id.slice(0,8)}`,version:1,status:'ACTIVE',createdAt:now,updatedAt:now,closedAt:null,closedBy:null,closeReason:null}});
  const own={...fixture,teacherAActiveSectionId:id};
  const enrollment=await prisma.enrollment.findFirst({where:{classSectionId:id}});
  const student=enrollment?{enrollmentId:enrollment.id,studentId:enrollment.studentId}:await seedExerciseSessionStudent(prisma,own,randomUUID().slice(0,8).toUpperCase(), 'ACTIVE',false);
  await prisma.studentProfile.update({where:{id:student.studentId},data:{gender:'MALE'}});
  const profile=await prisma.studentProfile.findUniqueOrThrow({where:{id:student.studentId}});
  const priorSource=await prisma.officialRosterImport.findFirst({where:{classSectionId:id,status:'VALIDATED',isCurrent:true}});
  const importId=priorSource?.id??uuidv7();
  if(!priorSource){
  await prisma.officialRosterImport.create({data:{id:importId,organizationId:fixture.organizationId,classSectionId:id,versionNumber:1,source:'FILE',fileName:'synthetic-settlement-browser.csv',sourceFileStorageKey:'synthetic/settlement-browser.csv',fileChecksumSha256:'a'.repeat(64),fieldMappingSnapshot:{studentNumber:'student_number',fullName:'full_name'},status:'RECEIVED',importedBy:fixture.teacherUserId,importedAt:now,createdAt:now,isCurrent:false}});
  await prisma.officialRosterImport.update({where:{id:importId},data:{status:'VALIDATING',version:{increment:1}}});
  await prisma.officialRosterEntry.create({data:{id:randomUUID(),organizationId:fixture.organizationId,rosterImportId:importId,classSectionId:id,sourceRowNumber:2,normalizedStudentNumber:profile.studentNumber,rawStudentNumberSafe:profile.studentNumber,fullName:profile.fullName,rowValidationStatus:'VALID',rowErrorCodes:[],rawRowSnapshotSafe:{},createdAt:now}});
  await prisma.officialRosterImport.update({where:{id:importId},data:{status:'VALIDATED',totalRowCount:1,validRowCount:1,isCurrent:true,version:{increment:1}}});
  }
  const source=await prisma.officialRosterImport.findUniqueOrThrow({where:{id:importId}});
  const [template]=await prisma.$queryRaw`SELECT id FROM v81_rule_templates WHERE organization_id=${fixture.organizationId}::uuid AND published_at IS NOT NULL ORDER BY version DESC LIMIT 1`;
  assert.ok(template);const templateId=template.id,published=new Date();
  await prisma.$executeRaw`INSERT INTO v81_course_rules(class_section_id,organization_id,minimum_minutes,weekly_limit,course_target,general_target,regular_deadline,closing_deadline,settlement_planned_at,published_at,version,template_id)
    VALUES(${id}::uuid,${fixture.organizationId}::uuid,30,4,600,600,'2026-08-31T15:59:59Z'::timestamptz,'2026-09-07T15:59:59Z'::timestamptz,'2026-09-07T16:00:00Z'::timestamptz,${published},1,${templateId}::uuid)`;
  fs.writeFileSync(target,JSON.stringify({id,name,student,importId,importVersion:source.version}));
  console.log('SYNTHETIC_SETTLEMENT_BROWSER_PREREQUISITES_CREATED');
 }
} finally {await prisma.$disconnect();}
