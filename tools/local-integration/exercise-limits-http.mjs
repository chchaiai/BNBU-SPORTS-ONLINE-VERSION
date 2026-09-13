import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {createTestPrisma} from '../../backend/test/helpers/database.ts';
const fixture=JSON.parse(readFileSync('/workspace/.browser-state/demand-fixture.json','utf8'));
const url=new URL('postgresql://sql-postgres:5432/v81_browser_test');url.username=process.env.PGUSER;url.password=process.env.PGPASSWORD;
const db=createTestPrisma(url.href);
async function api(path,token,body,key=randomUUID()){
 if(body&&path.startsWith('/exercise-sessions'))body={...body,clientObservedAt:new Date().toISOString()};
 const response=await fetch('http://127.0.0.1:3199/api/v1'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','idempotency-key':key,...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const value=await response.json();return {status:response.status,data:value.data,error:value.error??value.code};
}
const pass=check=>console.log(JSON.stringify({check,result:'PASS'}));
try{
 assert.equal((await db.$queryRaw`SELECT current_database() AS name`)[0].name,'v81_browser_test');
 const login=async account=>{const r=await api('/auth/password-login',null,{account,password:fixture.password});assert.equal(r.status,200);return r.data.accessToken;};
 const teacher=await login(fixture.teacherEmail),admin=await login(fixture.adminEmail);
 const challenge=await api('/auth/student-sign-in-codes',null,{organizationCode:fixture.organizationCode,account:fixture.studentEmail,channel:'EMAIL',locale:'en'});assert.equal(challenge.status,202);
 let code;for(let n=0;n<40&&!code;n++){
  const list=await(await fetch('http://mailpit:8025/api/v1/messages?limit=100')).json();
  const message=list.messages.find(item=>JSON.stringify(item.To).includes(fixture.studentEmail));
  if(message){const full=await(await fetch('http://mailpit:8025/api/v1/message/'+message.ID)).json();code=full.Text.match(/\b\d{6}\b/)?.[0];}
  if(!code)await delay(250);
 }
 const signed=await api('/auth/student-sign-in-codes/verify',null,{challengeId:challenge.data.challengeId,code,deviceId:randomUUID()});assert.equal(signed.status,200);const student=signed.data.accessToken;
 const enrollment=await db.enrollment.findUniqueOrThrow({where:{id:fixture.enrollmentId}}),section=enrollment.classSectionId;
 const route=`/class-sections/${section}/v81-rules`;
 const goalResult=await api('/admin/exercise-goal',admin);
 assert.equal(goalResult.status,200,JSON.stringify(goalResult));let goal=goalResult.data;
 const saveRules=async(maximumMinutes,minimumMinutes=1)=>{
  const r=(await api(route,teacher)).data;
  const result=await api(route,teacher,{templateId:r.template_id,minimumMinutes,maximumMinutes,weeklyLimit:r.weekly_limit,dailyLimit:r.daily_limit,
   courseTarget:goal.totalTargetMinutes-600,generalTarget:600,regularDeadline:r.regular_deadline,closingDeadline:r.closing_deadline,
   settlementPlannedAt:r.settlement_planned_at,publish:true,expectedVersion:r.version,globalTargetVersion:goal.version});
  assert.equal(result.status,201,JSON.stringify(result));
 };
 await saveRules(1);
 const started=await api('/exercise-sessions',student,{enrollmentId:fixture.enrollmentId});assert.equal(started.status,201,JSON.stringify(started));
 assert.equal(started.data.maximumDurationSeconds,60);
 await saveRules(2);
 assert.equal((await api('/exercise-sessions/'+started.data.id,student)).data.maximumDurationSeconds,60);
 pass('NEW_SESSION_CAP_SNAPSHOT_SURVIVES_TEACHER_CHANGE');
 const body={totalTargetMinutes:goal.totalTargetMinutes===1800?1200:1800,expectedVersion:goal.version},key=randomUUID();
 assert.equal((await api('/admin/exercise-goal',teacher,body)).status,403);
 assert.equal((await api('/admin/exercise-goal',student,body)).status,403);
 const changed=await api('/admin/exercise-goal',admin,body,key);assert.equal(changed.status,201,JSON.stringify(changed));goal=changed.data;
 assert.deepEqual((await api('/admin/exercise-goal',admin,body,key)).data,goal);
 assert.equal((await api(route,teacher)).data.allocation_pending,true);
 const ended=await api('/exercise-sessions/'+started.data.id+'/finish',student,{expectedVersion:started.data.version});assert.equal(ended.status,200);
 const blocked=await api('/exercise-sessions',student,{enrollmentId:fixture.enrollmentId});assert.equal(blocked.status,409);
 pass('GLOBAL_TARGET_SUPER_ONLY_IDEMPOTENT_ONGOING_ALLOWED_NEW_BLOCKED');
 await saveRules(1);
 assert.equal((await api(route,teacher)).data.allocation_pending,false);
 const next=await api('/exercise-sessions',student,{enrollmentId:fixture.enrollmentId});assert.equal(next.status,201,JSON.stringify(next));
 await delay(61000);
 const unattended=await db.exerciseSession.findUniqueOrThrow({where:{id:next.data.id}});
 assert.equal(unattended.status,'COMPLETED');assert.equal(unattended.actualDurationSeconds,60n);
 const systemEvents=await db.$queryRaw`SELECT is_system_actor FROM v81_events WHERE resource_id=${next.data.id}::uuid AND event_type='DURATION_LIMIT_REACHED'`;
 assert.equal(systemEvents[0]?.is_system_actor,true);
 pass('UNATTENDED_WORKER_COMPLETES_WITH_SYSTEM_PROVENANCE');
 const completed=await api('/exercise-sessions/'+next.data.id,student);assert.equal(completed.status,200);
 assert.equal(completed.data.status,'COMPLETED');assert.equal(completed.data.actualDurationSeconds,60);
 assert.equal(completed.data.endReason,'DURATION_LIMIT_REACHED');
 const record=await api('/exercise-records',student,{sessionId:next.data.id,creditType:'GENERAL',sportType:'RUNNING',description:'Synthetic snapshotted cap regression',clientRequestId:randomUUID()});
 assert.equal(record.status,201,JSON.stringify(record));
 const snapshot=await db.$queryRaw`SELECT maximum_minutes FROM v81_record_rule_snapshots WHERE record_id=${record.data.id}::uuid`;
 assert.equal(snapshot[0].maximum_minutes,1);
 pass('REAL_CLOCK_60_SECONDS_AUTO_COMPLETION_AND_RECORD_CAP');
}finally{await db.$disconnect();}
