// Real notification/read/preferences/auth flows for synthetic accounts only.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const bPath='.local/ocr-beta-private.json',b=JSON.parse(fs.readFileSync(bPath)),staff=JSON.parse(fs.readFileSync('.local/ocr-triplatform-20260913-private.json')),checks=[];
async function api(path,token,body,status=200,key=randomUUID(),method=body?'POST':'GET'){
 const r=await fetch('https://www.teacher.bnbusports.cn/api/v1'+path,{method,headers:{...(token?{authorization:`Bearer ${token}`} : {}),'content-type':'application/json','idempotency-key':key},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 const v=await r.json();assert.equal(r.status,status,JSON.stringify({path,status:r.status,code:v.code}));return v.data;
}
try{
 let token=b.session.accessToken;const me=await api('/me',token);assert.equal(me.studentProfile.id,b.studentId);assert.equal(me.studentProfile.fullName,'TEST BETA');
 const notices=await api('/notifications',token);assert.ok(notices.length>0);const own=notices[0],path=`/notifications/${own.id}/read`,key=randomUUID();
 await api(path,staff.teacherToken,undefined,404,randomUUID(),'POST');
 const read=await api(path,token,undefined,200,key,'POST');assert.ok(read.readAt);assert.deepEqual(await api(path,token,undefined,200,key,'POST'),read);
 assert.ok((await api('/notifications',token)).find(n=>n.id===own.id).readAt);checks.push('OWN_NOTIFICATION_READ_REPLAY_OTHER_USER_DENIED');
 const before=await api('/me/preferences',token),input={locale:'en',pushEnabled:false,emailEnabled:false,expectedVersion:before.version},prefKey=randomUUID();
 const changed=await api('/me/preferences',token,input,200,prefKey,'PATCH');assert.equal(changed.locale,'en');assert.deepEqual(await api('/me/preferences',token,input,200,prefKey,'PATCH'),changed);
 await api('/me/preferences',token,input,409,randomUUID(),'PATCH');
 await api('/me/preferences',token,{locale:before.locale,pushEnabled:before.pushEnabled,emailEnabled:before.emailEnabled,expectedVersion:changed.version},200,randomUUID(),'PATCH');checks.push('PREFERENCE_UPDATE_REPLAY_STALE_DENIED_RESTORED');
 b.session=await api('/auth/refresh',null,{refreshToken:b.session.refreshToken});fs.writeFileSync(bPath,JSON.stringify(b),{mode:0o600});token=b.session.accessToken;
 assert.equal((await api('/me',token)).studentProfile.id,b.studentId);checks.push('STUDENT_REFRESH_AND_AUTHENTICATED_READ');
 const login=await api('/auth/password-login',null,{account:staff.teacher.email,password:staff.teacher.password});assert.equal(login.user.organizationId,b.organizationId);
 await api('/auth/logout',login.accessToken,{refreshToken:login.refreshToken});await api('/me',login.accessToken,undefined,401);
 await api('/auth/refresh',null,{refreshToken:login.refreshToken},401);checks.push('SEPARATE_TEACHER_LOGIN_LOGOUT_ACCESS_AND_REFRESH_REVOKED');
}finally{const r={check:'CLOUD_NOTIFICATION_PREFERENCE_AUTH',observedAt:new Date().toISOString(),organizationId:b.organizationId,studentId:b.studentId,checks,allChecksCompleted:checks.includes('SEPARATE_TEACHER_LOGIN_LOGOUT_ACCESS_AND_REFRESH_REVOKED')};fs.writeFileSync('evidence/ocr-triplatform-20260913/cloud-notification-auth.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r));}
