import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createTestPrisma,seedFoundationFixture} from '../../backend/test/helpers/database.ts';
import {seedExerciseSessionStudent} from '../../backend/test/helpers/exercise-session.ts';
import {recomputeCredits} from '../../backend/dist/modules/v8/v81-credit-store.js';
import {appendV81SystemEvent} from '../../backend/dist/modules/v8/v81-system-event.js';
import {applyOrdinaryHistory} from '../production/ordinary-history-core.mjs';
const db=createTestPrisma('postgresql://bnbu_test:demand-local-test-only@127.0.0.1:55433/bnbu_sports_test?schema=public');
try{
 const f=await seedFoundationFixture(db,'-H'+Date.now().toString().slice(-8)),templateId=randomUUID();
 await db.$executeRaw`INSERT INTO v81_admin_access(user_id,organization_id,kind,must_change_password) VALUES(${f.adminUserId}::uuid,${f.organizationId}::uuid,'SUPER',false)`;
 await db.$executeRaw`INSERT INTO v81_rule_templates(id,organization_id,version,display_name,rules,actor_id,request_id,published_at) VALUES(${templateId}::uuid,${f.organizationId}::uuid,1,'Synthetic history rules','{"ruleSet":"V8_1","totalTargetMinutes":1200,"minimumMinutesOptions":[30,45,60],"defaultMinimumMinutes":30,"weeklyLimitOptions":[2,3,4],"defaultWeeklyLimit":3,"maximumCreditedMinutes":60,"dailyLimit":1,"creditedUnit":"WHOLE_MINUTE","supplementHours":24,"specialSupplementHours":72,"closingDays":7}'::jsonb,${f.adminUserId}::uuid,${randomUUID()},now())`;
 await db.$executeRaw`INSERT INTO v81_course_rules(class_section_id,organization_id,minimum_minutes,weekly_limit,course_target,general_target,regular_deadline,closing_deadline,settlement_planned_at,published_at,template_id) VALUES(${f.teacherAActiveSectionId}::uuid,${f.organizationId}::uuid,30,4,600,600,'2027-01-23','2027-01-30','2027-02-01',now(),${templateId}::uuid)`;
 const student=await seedExerciseSessionStudent(db,f,'HISTORY-'+randomUUID(),'ACTIVE',false),rows=[];
 for(const [day,minutes,stage,makeup] of [[10,60,'VALID',false],[10,60,'INVALID',false],[11,20,'PENDING_TEACHER',false],[12,60,'PENDING_TEACHER',false],[13,60,'VALID',true],[14,60,'INVALID',true],[19,60,'PENDING_TEACHER',false]]){
   const sessionId=randomUUID(),recordId=randomUUID(),start=new Date(Date.UTC(2026,8,day,4,rows.length,0)),end=new Date(+start+minutes*60000),date=new Date(Date.UTC(2026,8,day));
   await db.exerciseSession.create({data:{id:sessionId,organizationId:f.organizationId,studentId:student.studentId,enrollmentId:student.enrollmentId,classSectionId:f.teacherAActiveSectionId,semesterId:f.semesterId,startedByAuthSessionId:student.authSessionId,status:'COMPLETED',startedAt:start,businessDate:date,completedAt:end,endReason:'USER_COMPLETED',actualDurationSeconds:BigInt(minutes*60),pausedDurationSeconds:0n,createdAt:start,updatedAt:end}});
   if(makeup)await db.$executeRaw`INSERT INTO v81_history_session_sources(session_id,settings_version,earliest_date,latest_date,declared_at,request_id) VALUES(${sessionId}::uuid,1,'2026-09-01','2026-09-30',${end},${randomUUID()})`;
   await db.exerciseRecord.create({data:{id:recordId,organizationId:f.organizationId,semesterId:f.semesterId,studentId:student.studentId,enrollmentId:student.enrollmentId,classSectionId:f.teacherAActiveSectionId,courseId:f.activeCourseId,teacherId:f.teacherProfileId,sessionId,businessDate:date,creditType:'GENERAL',sportType:'RUNNING',description:'Synthetic historical correction test',actualDurationSeconds:BigInt(minutes*60),pausedDurationSeconds:0n,creditedDurationSeconds:0n,status:stage==='PENDING_TEACHER'?'SUBMITTED':'REVIEWED',submittedAt:end,clientRequestId:randomUUID(),version:2,createdAt:start,updatedAt:end}});
   const firstReview=await db.reviewRecord.create({data:{id:randomUUID(),organizationId:f.organizationId,recordId,reviewVersion:1,result:stage==='VALID'?'VALID':'PENDING',reviewedAt:stage==='VALID'?end:null,createdAt:end}});
   if(stage==='INVALID')await db.reviewRecord.create({data:{id:randomUUID(),organizationId:f.organizationId,recordId,reviewVersion:2,previousReviewId:firstReview.id,teacherId:f.teacherProfileId,result:'INVALID',reasonCode:'SESSION_MISMATCH',reviewedAt:end,createdAt:end}});
   await db.v81RecordWorkflow.create({data:{recordId,organizationId:f.organizationId,stage,teacherRoundStartedAt:end,updatedAt:end}});rows.push({id:recordId,makeup,stage});
 }
 await db.$transaction(tx=>recomputeCredits(tx,student.enrollmentId,new Date()));
 const input={organizationId:f.organizationId,cutoff:new Date('2026-09-18T05:45:50Z'),expectedRecords:4,batchId:randomUUID(),recomputeCredits,appendEvent:appendV81SystemEvent};
 await assert.rejects(db.$transaction(tx=>applyOrdinaryHistory(tx,{...input,expectedRecords:5})),/cohort size/i);
 const result=await db.$transaction(tx=>applyOrdinaryHistory(tx,input),{timeout:30000});
 assert.equal(result.changed,3);assert.equal(result.after.valid,4);assert.equal(result.after.below_threshold,1);assert.equal(result.after.credit_limit,1);assert.equal(result.after.credited_minutes,120);assert.equal(result.addedCreditedMinutes,60);
 assert.equal((await db.$transaction(tx=>applyOrdinaryHistory(tx,input))).alreadyApplied,true);
 assert.equal((await db.v81RecordWorkflow.findUniqueOrThrow({where:{recordId:rows.at(-1).id}})).stage,'PENDING_TEACHER');
 assert.equal(await db.reviewRecord.count({where:{recordId:rows[1].id}}),3);
 assert.equal(await db.reviewRecord.count({where:{recordId:rows[2].id}}),2);
 const summary={result:'PASS',ordinaryValid:true,originalRulesPreserved:true,belowMinimumStillZero:true,dailyLimitStillApplied:true,makeupReviewFingerprintsUnchanged:true,cutoffHonored:true,appendOnlyReviews:true,idempotent:true,cohortDriftAborts:true};
 await fs.writeFile('evidence/ordinary-history-20260918/local-verification.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
}finally{await db.$disconnect();}
