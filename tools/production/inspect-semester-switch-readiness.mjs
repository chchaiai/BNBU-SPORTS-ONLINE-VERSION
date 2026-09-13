import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const state=JSON.parse(fs.readFileSync('.local/ocr-triplatform-20260913-private.json'));
const prior=JSON.parse(fs.readFileSync('evidence/ocr-triplatform-20260913/cloud-semester-governance.json'));
const base='https://www.teacher.bnbusports.cn/api/v1';
const login=await fetch(base+'/auth/password-login',{method:'POST',headers:{'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify({account:state.admin.email,password:state.admin.password}),signal:AbortSignal.timeout(20000)});
assert.equal(login.status,200);const token=(await login.json()).data.accessToken;
async function get(path){const response=await fetch(base+path,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);return (await response.json()).data;}
assert.equal((await get('/me')).user.organizationId,state.fixture.organizationId);
const courses=[];let cursor=null,first;
for(let page=0;page<100;page++){
 const result=await get(`/admin/semesters/${prior.semesterId}/switch-check?limit=1`+(cursor?'&after='+encodeURIComponent(cursor):''));
 first??=result;
 assert.equal(result.totalCourseCount,first.totalCourseCount);
 assert.deepEqual(result.checks,first.checks);
 courses.push(...result.courses);
 if(!result.nextCursor)break;
 assert.notEqual(result.nextCursor,cursor);cursor=result.nextCursor;
}
assert.equal(courses.length,first.totalCourseCount);
assert.equal(new Set(courses.map(c=>c.classSectionId)).size,courses.length);
const result={scope:'Production read-only switch readiness; synthetic organization only, no semester switch',observedAt:new Date().toISOString(),organizationId:state.fixture.organizationId,targetId:prior.semesterId,current:first.current,ready:first.ready,checks:first.checks,totalCourseCount:first.totalCourseCount,paginationComplete:true,courses:courses.map(c=>({classSectionId:c.classSectionId,checks:c.checks.filter(x=>x.status!=='CLEAR')}))};
fs.writeFileSync('evidence/ocr-triplatform-20260913/semester-switch-readiness-inventory.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({total:result.totalCourseCount,ready:result.ready,paginationComplete:true,checks:result.checks}));
