import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {createTestPrisma} from '../../backend/test/helpers/database.ts';
const uuidv7=createRequire(new URL('../../backend/package.json',import.meta.url))('uuid').v7;
const dir='/workspace/.browser-state',state=JSON.parse(fs.readFileSync(dir+'/state.json'));assert.equal(state.database,'v81_browser_test');
const url=new URL('postgresql://sql-postgres:5432/v81_browser_test');url.username=process.env.PGUSER;url.password=process.env.PGPASSWORD;const prisma=createTestPrisma(url.href);
try{
 assert.equal((await prisma.$queryRaw`SELECT current_database() AS name`)[0].name,'v81_browser_test');
 if(fs.existsSync(dir+'/teacher-semesters-fixture.json'))console.log('SYNTHETIC_TEACHER_SEMESTERS_PRESENT');
 else{
  const original=await prisma.classSection.findUniqueOrThrow({where:{id:state.fixture.teacherAActiveSectionId}}),source=await prisma.semester.findUniqueOrThrow({where:{id:original.semesterId}});
  const ownedId=uuidv7(),unownedId=uuidv7(),sectionId=uuidv7(),now=new Date();
  await prisma.$transaction(async tx=>{
   for(const [id,label,academicYear]of [[ownedId,'Synthetic archived teacher semester','1986-1987'],[unownedId,'Synthetic unowned semester','1987-1988']])await tx.semester.create({data:{...source,id,academicYear,displayName:label,status:'ARCHIVED',startDate:new Date(academicYear.slice(0,4)+'-09-01'),endDate:new Date(academicYear.slice(5)+'-01-31'),version:1,createdAt:now,updatedAt:now}});
   await tx.classSection.create({data:{...original,id:sectionId,semesterId:ownedId,classCode:'SYNTHETIC-HISTORY',displayName:'Synthetic archived semester class',status:'ACTIVE',isEnrollmentOpen:false,checkInWindowMode:'UNAVAILABLE',checkInStartDate:null,checkInEndDate:null,dailyStartTime:null,dailyEndTime:null,submissionDeadlineAt:null,version:1,createdAt:now,updatedAt:now}});
  });
  fs.writeFileSync(dir+'/teacher-semesters-fixture.json',JSON.stringify({ownedId,unownedId,sectionId}));console.log('SYNTHETIC_ARCHIVED_SEMESTER_READ_PREREQUISITES_CREATED');
 }
}finally{await prisma.$disconnect();}
