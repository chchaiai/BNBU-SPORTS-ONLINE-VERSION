// Bounded production clock test using task-owned synthetic identities only.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const privatePath='.local/invite-natural-private.json', evidencePath='evidence/ocr-triplatform-20260913/invite-natural-expiry.json';
const staff=JSON.parse(fs.readFileSync('.local/ocr-triplatform-20260913-private.json'));
const fixture=JSON.parse(fs.readFileSync('.local/ocr-beta-course.json'));
async function api(path,{body,token,key=randomUUID(),capability,post=false}={}) {
  const r=await fetch('https://www.teacher.bnbusports.cn/api/v1'+path,{method:body!==undefined||post?'POST':'GET',headers:{'content-type':'application/json','idempotency-key':key,...(token?{authorization:`Bearer ${token}`} : {}),...(capability?{'x-join-capability':capability}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
  const v=await r.json(); return {status:r.status,...v};
}
function save(state,result){fs.writeFileSync(privatePath,JSON.stringify(state),{mode:0o600});fs.writeFileSync(evidencePath,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
if(process.argv[2]==='start'){
  const me=await api('/me',{token:staff.teacherToken});assert.equal(me.data.user.organizationId,fixture.organizationId);
  const before=Date.now();
  const invite=await api(`/class-sections/${fixture.sectionId}/course-invites`,{token:staff.teacherToken,body:{expiresInMinutes:5}});
  assert.equal(invite.status,201,JSON.stringify({status:invite.status,code:invite.code}));
  const identity={fullName:'TEST NATURAL GRACE',studentNumber:'9900000011',gender:'MALE',gradeYear:2026};
  const key=randomUUID();const path=`/course-invites/${encodeURIComponent(invite.data.inviteToken)}`;
  const issued=await api(path+'/join-capabilities',{body:identity,key});assert.equal(issued.status,201,JSON.stringify({status:issued.status,code:issued.code}));
  const expiresAt=invite.data.expiresAt;assert.ok(Date.parse(expiresAt)>=before+299000&&Date.parse(expiresAt)<=Date.now()+300000);
  const state={invite:invite.data,issued:issued.data,identity,key,path,joinKey:randomUUID()};
  save(state,{result:'WAITING_NATURAL_EXPIRY',startedAt:new Date().toISOString(),expiresAt,sectionId:fixture.sectionId,registrationAccepted:true});
}else if(process.argv[2]==='reserve-end'){
  const state=JSON.parse(fs.readFileSync(privatePath));
  assert.ok(Date.now()<Date.parse(state.invite.expiresAt));
  const issued=await api(state.path+'/join-capabilities',{body:{...state.identity,fullName:'TEST GRACE END',studentNumber:'9900000012'}});
  assert.equal(issued.status,201);state.endCapability=issued.data;
  fs.writeFileSync(privatePath,JSON.stringify(state),{mode:0o600});console.log('Grace-end test registration reserved before expiry');
}else if(process.argv[2]==='end'){
  const state=JSON.parse(fs.readFileSync(privatePath));assert.ok(Date.now()>Date.parse(state.invite.expiresAt)+601000);
  const denied=await api(state.path+'/join',{post:true,capability:state.endCapability.joinCapability});
  assert.ok([401,410].includes(denied.status),JSON.stringify({status:denied.status,code:denied.code}));
  assert.ok(['AUTH_JOIN_CAPABILITY_EXPIRED','AUTH_JOIN_CAPABILITY_INVALID','COURSE_INVITE_EXPIRED'].includes(denied.code),JSON.stringify({status:denied.status,code:denied.code}));
  const result=JSON.parse(fs.readFileSync(evidencePath));result.graceEndBoundary={status:denied.status,code:denied.code,observedAt:new Date().toISOString()};save(state,result);
}else{
  const state=JSON.parse(fs.readFileSync(privatePath));assert.ok(Date.now()>Date.parse(state.invite.expiresAt)+1000);
  const replay=await api(state.path+'/join-capabilities',{body:state.identity,key:state.key});assert.equal(replay.status,201);assert.deepEqual(replay.data,state.issued);
  const fresh=await api(state.path+'/join-capabilities',{body:state.identity});assert.equal(fresh.code,'COURSE_CLASS_SECTION_NOT_JOINABLE');
  const preview=await api(state.path+'/preview');assert.equal(preview.code,'COURSE_INVITE_EXPIRED');
  const joined=await api(state.path+'/join',{post:true,capability:state.issued.joinCapability,key:state.joinKey});assert.equal(joined.status,201,JSON.stringify({status:joined.status,code:joined.code}));
  const repeated=await api(state.path+'/join',{post:true,capability:state.issued.joinCapability,key:state.joinKey});assert.deepEqual(repeated.data,joined.data);
  state.joined=joined.data;
  save(state,{result:'PASS',observedAt:new Date().toISOString(),expiresAt:state.invite.expiresAt,sectionId:fixture.sectionId,checks:['REAL_FIVE_MINUTE_NATURAL_EXPIRY','EXISTING_REGISTRATION_REPLAY_IDENTICAL','NEW_EXPIRED_REGISTRATION_DENIED','EXPIRED_PREVIEW_DENIED','GRACE_JOIN_ACCEPTED','JOIN_REPLAY_IDENTICAL'],graceEndBoundary:'PENDING'});
}
