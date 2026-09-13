import fs from 'node:fs';
import assert from 'node:assert/strict';
const file='.local/bug-20260912-cloud-private.json',fixture=JSON.parse(fs.readFileSync(file));
const origin='https://www.teacher.bnbusports.cn/api/v1';
const login=await fetch(origin+'/auth/password-login',{method:'POST',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({account:fixture.teacher.email,password:fixture.teacher.password})});
const data=await login.json();assert.equal(login.status,200);
fixture.teacherToken=data.data.accessToken;fs.writeFileSync(file,JSON.stringify(fixture));
const response=await fetch(origin+'/class-sections/'+fixture.fixture.teacherAActiveSectionId,{headers:{authorization:'Bearer '+fixture.teacherToken}});
const result=await response.json();
console.log(JSON.stringify({check:'SYNTHETIC_COURSE_CURRENT_STATE',httpStatus:response.status,code:result.code,
 course:result.data?{id:result.data.id,displayName:result.data.displayName,status:result.data.status,closedAt:result.data.closedAt,version:result.data.version}:null}));
const refreshed=await fetch(origin+'/auth/refresh',{method:'POST',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({refreshToken:fixture.studentSession.refreshToken})});
const refreshedData=await refreshed.json();
if(refreshed.status===200){fixture.studentSession={...fixture.studentSession,...refreshedData.data};fs.writeFileSync(file,JSON.stringify(fixture));}
console.log(JSON.stringify({check:'SYNTHETIC_STUDENT_REFRESH',httpStatus:refreshed.status,code:refreshedData.code}));
