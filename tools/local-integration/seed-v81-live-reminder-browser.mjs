const makeupRun='live-reminder';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { createTestPrisma } from '../../backend/test/helpers/database.ts';
import { seedExerciseSessionStudent } from '../../backend/test/helpers/exercise-session.ts';
const uuidv7=createRequire(new URL('../../backend/package.json',import.meta.url))('uuid').v7;
const dir='/workspace/.browser-state',file=dir+'/'+makeupRun+'.json',state=JSON.parse(fs.readFileSync(dir+'/state.json'));
assert.equal(state.database,'v81_browser_test');
const url=new URL('postgresql://sql-postgres:5432/v81_browser_test');url.username=process.env.PGUSER;url.password=process.env.PGPASSWORD;
const prisma=createTestPrisma(url.href);
try {
 assert.equal((await prisma.$queryRaw`SELECT current_database() AS name`)[0].name,'v81_browser_test');
 if(!fs.existsSync(file)){
  const source=await prisma.classSection.findUniqueOrThrow({where:{id:state.fixture.teacherAActiveSectionId}});
  const semester=await prisma.semester.findUniqueOrThrow({where:{id:source.semesterId}});
  const now=new Date(),regular=new Date(now.getTime()+3600000),closing=new Date(regular.getTime()+7*86400000),sectionId=uuidv7(),suffix='REMINDER'+randomUUID().slice(0,8).toUpperCase();
  assert.ok(semester.startDate<regular&&semester.endDate>closing);
  await prisma.$transaction(async tx=>{
   await tx.classSection.create({data:{...source,id:sectionId,classCode:suffix,displayName:'Synthetic Live Reminder '+suffix,status:'ACTIVE',isEnrollmentOpen:false,closedAt:null,closedBy:null,closeReason:null,version:1,createdAt:now,updatedAt:now,
    checkInWindowMode:'AVAILABLE',checkInStartDate:semester.startDate,checkInEndDate:new Date(closing.toISOString().slice(0,10)+'T00:00:00.000Z'),dailyStartTime:new Date('1970-01-01T00:00:00.000Z'),dailyEndTime:new Date('1970-01-01T23:59:00.000Z'),submissionDeadlineAt:regular}});
   // A historical course schedule is an explicit database fixture, not a Web publication claim.
   await tx.$executeRaw`INSERT INTO v81_course_rules(class_section_id,organization_id,minimum_minutes,weekly_limit,course_target,general_target,regular_deadline,closing_deadline,settlement_planned_at,published_at,version,template_id)
     SELECT ${sectionId}::uuid,organization_id,30,4,600,600,${regular},${closing},${closing},${now},1,template_id FROM v81_course_rules WHERE class_section_id=${source.id}::uuid`;
  });
  const student=await seedExerciseSessionStudent(prisma,{...state.fixture,teacherAActiveSectionId:sectionId},suffix,'ACTIVE',false);
  await prisma.studentProfile.update({where:{id:student.studentId},data:{gender:'FEMALE'}});
  fs.writeFileSync(file,JSON.stringify({sectionId,student,suffix,regular:regular.toISOString(),closing:closing.toISOString(),fixture:'SYNTHETIC_HISTORICAL_SCHEDULE'},null,2),{mode:0o600});
 }
 const fixture=JSON.parse(fs.readFileSync(file));assert.ok(Date.parse(fixture.regular)>Date.now()&&Date.parse(fixture.closing)>Date.now());
 const teacher=await prisma.classSection.findUniqueOrThrow({where:{id:fixture.sectionId},include:{teacher:true}});
 const where={notificationType:'COURSE_DEADLINE_REMINDER',OR:[{recipientUserId:fixture.student.userId,targetId:fixture.student.enrollmentId},{recipientUserId:teacher.teacher.userId,targetId:fixture.sectionId}]};
 let notices=[];
 for(let attempt=0;attempt<90;attempt++){
  notices=await prisma.notification.findMany({where});
  if(notices.length===2)break;
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 assert.equal(notices.length,2,'Actual reminder worker must produce both scoped notices');
 assert.ok(notices.every(n=>n.createdAt>=new Date(fixture.regular).getTime()-3600000));
 const events=await prisma.$queryRaw`SELECT resource_id,actor_id FROM v81_events WHERE resource_type='COURSE_REMINDER' AND resource_id IN (${notices[0].id}::uuid,${notices[1].id}::uuid)`;
 assert.equal(events.length,2);assert.ok(events.every(e=>e.actor_id===null));
 fixture.notices=notices.map(n=>({id:n.id,targetId:n.targetId,targetType:n.targetType}));
 fs.writeFileSync(file,JSON.stringify(fixture,null,2),{mode:0o600});
 await new Promise(resolve=>setTimeout(resolve,12000));
 assert.equal(await prisma.notification.count({where}),2);
 console.log(JSON.stringify({check:'LIVE_REMINDER_WORKER_BROWSER_FIXTURE',result:'PASS',syntheticSchedule:true,notificationsInsertedByHarness:false,actualSystemEvents:2,recipientCount:2,rescanNoDuplicates:true}));
} finally {await prisma.$disconnect();}
