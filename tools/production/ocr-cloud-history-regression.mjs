// Public API course creation, member reuse, history and course retirement in synthetic org.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const privatePath='.local/ocr-triplatform-20260913-private.json',state=JSON.parse(fs.readFileSync(privatePath));
const t=state.teacherToken,a=state.adminToken;let s=state.studentSession.accessToken,section,session;const checks=[];
async function api(path,token,body,status=body?201:200,key=randomUUID(),method=body?'POST':'GET',extra={}){
 const r=await fetch('https://www.teacher.bnbusports.cn/api/v1'+path,{method,headers:{...(token?{authorization:`Bearer ${token}`} : {}),'content-type':'application/json','idempotency-key':key,...extra},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 const v=await r.json();assert.equal(r.status,status,JSON.stringify({path,status:r.status,code:v.code}));return v.data;
}
try{
 if(process.argv.includes('--readback-only')){const previous=JSON.parse(fs.readFileSync('evidence/ocr-triplatform-20260913/cloud-history-lifecycle.json'));section={id:previous.sectionId};session={id:previous.sessionId};checks.push(...previous.checks);}else{
 const me=await api('/me',s);assert.equal(me.user.organizationId,state.fixture.organizationId);
 const profileInput={collegeName:'Synthetic College',majorName:'Software',dateOfBirth:'2004-02-29',regionCode:'OTHER',otherRegionName:'Japan',expectedVersion:me.studentProfile.version},profileKey=randomUUID();
 const profile=await api('/me/student-profile',s,profileInput,200,profileKey);assert.deepEqual(await api('/me/student-profile',s,profileInput,200,profileKey),profile);checks.push('PROFILE_COMPLETE_AND_REPLAY');
 const goal=await api('/admin/exercise-goal',a),goalInput={totalTargetMinutes:1800,expectedVersion:goal.version},goalKey=randomUUID();
 const changed=await api('/admin/exercise-goal',a,goalInput,201,goalKey);assert.deepEqual(await api('/admin/exercise-goal',a,goalInput,201,goalKey),changed);checks.push('SYNTHETIC_GLOBAL_GOAL_AND_REPLAY');
 const courseInput={courseId:state.fixture.activeCourseId,semesterId:state.fixture.semesterId,classCode:'HISTORY-'+Date.now(),displayName:'Synthetic history retirement 20260913',isEnrollmentOpen:true},courseKey=randomUUID();
 if(state.historyRegression?.sectionId){section=await api(`/class-sections/${state.historyRegression.sectionId}`,t);assert.match(section.displayName,/^Synthetic history/);}else{
 section=await api('/class-sections',t,courseInput,201,courseKey);assert.deepEqual(await api('/class-sections',t,courseInput,201,courseKey),section);state.historyRegression={sectionId:section.id};fs.writeFileSync(privatePath,JSON.stringify(state),{mode:0o600});}
 if(section.checkInStartDate===null)section=await api(`/class-sections/${section.id}`,t,{checkInWindowMode:'AVAILABLE',checkInStartDate:'2026-09-01',checkInEndDate:'2027-01-23',dailyStartTime:'00:00',dailyEndTime:'23:59',submissionDeadlineAt:'2027-01-23T15:59:59Z',expectedVersion:section.version},200,randomUUID(),'PATCH');
 assert.equal(section.checkInStartDate,'2026-09-01');assert.equal(section.dailyStartTime,'00:00:00');
 const templateList=await api('/rule-templates',a);
 const template=await api('/rule-templates',a,{displayName:'Synthetic history rule 20260913',expectedVersion:templateList.items[0]?.version??0});
 await api(`/class-sections/${section.id}/v81-rules`,t,{templateId:template.id,minimumMinutes:1,weeklyLimit:3,courseTarget:1200,generalTarget:600,regularDeadline:'2027-01-23T00:00:00Z',closingDeadline:'2027-01-30T00:00:00Z',settlementPlannedAt:'2027-01-30T01:00:00Z',publish:true,globalTargetVersion:changed.version,expectedVersion:0});checks.push('TEACHER_COURSE_CREATE_PATCH_PUBLISH');
 const invite=await api(`/class-sections/${section.id}/course-invites`,t,{}),identity=profile.studentProfile;
 const capability=await api(`/course-invites/${invite.inviteToken}/join-capabilities/member`,s,{fullName:identity.fullName,studentNumber:identity.studentNumber,gender:identity.gender,gradeYear:identity.gradeYear});
 const joined=await api(`/course-invites/${invite.inviteToken}/join`,null,undefined,201,randomUUID(),'POST',{'x-join-capability':capability.joinCapability});assert.equal(joined.studentProfile.id,state.student.studentId);assert.equal(joined.enrollment.status,'ACTIVE');
 state.studentSession=joined.authSession;s=joined.authSession.accessToken;state.historyRegression.enrollmentId=joined.enrollment.id;fs.writeFileSync(privatePath,JSON.stringify(state),{mode:0o600});checks.push('EXISTING_STUDENT_MEMBER_CAPABILITY_JOIN_PROFILE_REUSED');
 const settingsPath=`/class-sections/${section.id}/history-settings`,settings=await api(settingsPath,s);
 await api(settingsPath,t,{enabled:true,earliestDate:'2026-08-01',latestDate:'2027-01-23',expectedVersion:settings.version});
 session=await api(`/enrollments/${joined.enrollment.id}/historical-sessions`,s,{startedAt:'2026-09-08T12:00:00+08:00',durationSeconds:120});assert.equal(session.recordOrigin,'HISTORICAL');checks.push('HISTORICAL_SETTINGS_AND_SESSION');
 section=await api(`/class-sections/${section.id}`,t);const deletion={expectedVersion:section.version,confirmationCourseName:section.displayName,confirmCourseRetirement:true,reason:'Synthetic retirement preserves student history'},deleteKey=randomUUID();
 const deleted=await api(`/class-sections/${section.id}/delete`,t,deletion,201,deleteKey);assert.equal(deleted.deleted,true);assert.deepEqual(await api(`/class-sections/${section.id}/delete`,t,deletion,201,deleteKey),deleted);checks.push('COURSE_RETIREMENT_AND_REPLAY');
 }
 assert.equal((await api('/me',s)).studentProfile.id,state.student.studentId);
 const retained=await api(`/exercise-sessions/${session.id}`,s);assert.equal(retained.id,session.id);assert.equal(retained.status,'COMPLETED');assert.equal(retained.actualDurationSeconds,120);assert.equal(retained.businessDate,'2026-09-08');checks.push('STUDENT_PROFILE_AND_HISTORY_SURVIVE_COURSE_RETIREMENT');
}finally{const r={check:'CLOUD_HISTORY_COURSE_LIFECYCLE',observedAt:new Date().toISOString(),organizationId:state.fixture.organizationId,sectionId:section?.id,sessionId:session?.id,checks,allChecksCompleted:checks.includes('STUDENT_PROFILE_AND_HISTORY_SURVIVE_COURSE_RETIREMENT')};fs.writeFileSync('evidence/ocr-triplatform-20260913/cloud-history-lifecycle.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r));}
