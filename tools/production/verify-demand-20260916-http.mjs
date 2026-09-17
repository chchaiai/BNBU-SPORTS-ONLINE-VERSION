// Only the newly created DEMAND16 synthetic organization is mutated.
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const f=JSON.parse(await fs.readFile('.local/demand-20260916-private.json','utf8')),checks=[];
const origin='https://www.teacher.bnbusports.cn/api/v1';
async function api(path,token,{body,method=body?'POST':'GET',status=200,key=randomUUID()}={}){
 const requestId=randomUUID();const r=await fetch(origin+path,{method,headers:{'content-type':'application/json','x-request-id':requestId,'idempotency-key':key,...(token?{authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const value=await r.json();assert.equal(r.status,status,JSON.stringify({path,status:r.status,code:value.code,requestId:value.requestId}));
 if(status>=400){assert.equal(value.requestId,requestId);assert.ok(value.code);assert.doesNotMatch(JSON.stringify(value),/stack|prisma|SELECT |passwordHash/i);checks.push({requirement:12,path,status,code:value.code,requestId});return value;}
 return value.data;
}
const s=f.studentSession.accessToken,a=f.adminToken,t=f.teacherToken;
try{
 if(process.argv.includes('--resume'))checks.push(...JSON.parse(await fs.readFile('evidence/demand-20260916/online/http-result.json','utf8')).checks);
 else {
 let me=await api('/me',s);assert.equal(me.user.organizationId,f.fixture.organizationId);assert.equal(me.studentProfile.majorName,'未分流');
 const input={collegeName:'SCC',majorName:'JC',dateOfBirth:'2004-01-01',regionCode:'HK',expectedVersion:me.studentProfile.version};
 const key=randomUUID();me=await api('/me/student-profile',s,{body:input,key});assert.equal(me.studentProfile.majorName,'JC');assert.equal(me.studentProfile.majorConfirmationLocked,true);
 await api('/me/student-profile',s,{body:input,key});
 await api('/me/student-profile',s,{body:{...input,majorName:'CCM',expectedVersion:me.studentProfile.version},status:422});
 await api('/students/'+f.student.studentId,a,{method:'PATCH',body:{collegeName:'SCC',majorName:'CCM',majorCorrectionReason:'Synthetic demand acceptance correction',expectedVersion:me.studentProfile.version}});
 me=await api('/me',s);assert.equal(me.studentProfile.majorName,'CCM');assert.equal(me.studentProfile.majorConfirmationLocked,true);
 await api('/me/student-profile',s,{body:{...input,expectedVersion:me.studentProfile.version},status:422});
 checks.push({requirement:[18,22],result:'PASS',confirmedOnce:true,adminCorrectionPreservesLock:true});
 await api('/me/email-verification-challenges',s,{body:{email:'invalid@mail.bnbu.edu.cn',locale:'zh-CN'},status:422});
 checks.push({requirement:14,result:'PASS',invalidNewBindingRejectedBeforeMail:true});
 }
 const section=await api('/class-sections/'+f.fixture.teacherAActiveSectionId,t);
 await api('/class-sections/'+section.id,t,{method:'PATCH',body:{checkInEndDate:'2027-02-02',expectedVersion:section.version},status:409});
 checks.push({requirement:16,result:'PASS',publishedScheduleMutationRejected:true});
 const outbox=await api('/health/admin/outbox?limit=1',a);assert.equal(outbox.scope,'CURRENT_ORGANIZATION');assert.equal(outbox.items.length,1);assert.ok(outbox.nextCursor);
 const next=await api('/health/admin/outbox?limit=1&cursor='+encodeURIComponent(outbox.nextCursor),a);assert.notEqual(next.items[0].id,outbox.items[0].id);
 const type=outbox.items[0].eventType;const filtered=await api('/health/admin/outbox?limit=20&eventType='+encodeURIComponent(type),a);assert.ok(filtered.items.every(x=>x.eventType===type));
 const health=await api('/health/admin',a);assert.equal(health.dependencies.notificationQueue.backlog,filtered.backlog);
 assert.doesNotMatch(JSON.stringify(filtered),/payload|password|accessToken|refreshToken/i);
 await api('/health/admin/outbox',t,{status:403});checks.push({requirement:21,result:'PASS',pagination:true,filter:true,countMatchesHealth:true,teacherDenied:true});
}finally{await fs.writeFile('evidence/demand-20260916/online/http-result.json',JSON.stringify({checks,completed:checks.some(c=>c.requirement===21)},null,2));}
