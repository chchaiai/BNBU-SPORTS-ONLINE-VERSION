// Read-only verification of the repaired real course and the isolated cloud fixture.
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';import {validateEnvironment} from '/app/dist/common/config/environment.js';import {PrismaService} from '/app/dist/common/database/prisma.service.js';
await loadRuntimeSecrets(process.env);const db=new PrismaService(validateEnvironment(process.env).RUNTIME_CONFIG);
try{
 const plan=JSON.parse(readFileSync('/acceptance/course-closure-repair-plan.json','utf8')),fixture=JSON.parse(readFileSync('/acceptance/closure-checkin.json','utf8'));const courseIds=plan.sections.map(s=>s.id),memberIds=plan.sections.flatMap(s=>s.members.map(e=>e.id));
 const actual=await db.enrollment.findMany({where:{id:{in:memberIds}},select:{status:true,endReason:true}});assert.equal(actual.length,2);assert.ok(actual.every(e=>e.status==='REMOVED'&&e.endReason==='COURSE_CLOSED'));assert.equal(await db.enrollment.count({where:{classSectionId:{in:courseIds},status:'ACTIVE'}}),0);
 const history=await db.exerciseRecord.count({where:{classSectionId:{in:courseIds}}});assert.equal(history,3);
 assert.equal(await db.enrollmentStatusEvent.count({where:{enrollmentId:{in:memberIds},source:'SYSTEM',reason:'COURSE_CLOSED',toStatus:'REMOVED'}}),2);
 const isolated=await db.enrollment.findMany({where:{classSectionId:fixture.sectionId},select:{status:true,endReason:true}});assert.equal(isolated.length,3);assert.ok(isolated.every(e=>e.status==='REMOVED'&&e.endReason==='COURSE_CLOSED'));
 const workflows=await db.$queryRaw`SELECT w.stage,w.supplement_used,r.credited_duration_seconds::int AS seconds FROM v81_record_workflows w JOIN exercise_records r ON r.id=w.record_id WHERE r.class_section_id=${fixture.sectionId}::uuid`;assert.equal(workflows.length,1);assert.equal(workflows[0].stage,'VALID');assert.equal(workflows[0].supplement_used,true);assert.equal(workflows[0].seconds,0);
 console.log(JSON.stringify({check:'COURSE_CLOSURE_CLOUD_DATABASE',result:'PASS',realCourseActiveMembers:0,repairedMembers:2,realHistoricalRecords:history,auditedSystemRemovals:2,isolatedAutoRemoved:3,isolatedClosedRecordReviewed:true,supplementUsed:true,creditedSeconds:0}));
}finally{await db.$disconnect();}
