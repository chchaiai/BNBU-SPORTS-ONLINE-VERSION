// Synthetic teacher password change with restoration and explicit session checks.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID,randomBytes} from 'node:crypto';
const path='.local/ocr-triplatform-20260913-private.json',state=JSON.parse(fs.readFileSync(path)),checks=[];
const old=state.teacher.password,next=randomBytes(32).toString('base64url'),recovery='.local/ocr-own-password-recovery.json';let owner,changed=false;
async function api(p,token,body,status=body?201:200,key=randomUUID()){const r=await fetch('https://www.teacher.bnbusports.cn/api/v1'+p,{method:body?'POST':'GET',headers:{...(token?{authorization:`Bearer ${token}`} : {}),'content-type':'application/json','idempotency-key':key},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});const v=await r.json();assert.equal(r.status,status,JSON.stringify({path:p,status:r.status,code:v.code}));return v.data;}
const login=password=>api('/auth/password-login',null,{account:state.teacher.email,password},200);
try{
 owner=await login(old);const other=await login(old);assert.equal(owner.user.organizationId,state.fixture.organizationId);assert.equal(owner.user.id,state.fixture.teacherUserId);
 const security=await api('/auth/account-security',owner.accessToken),input={currentPassword:old,newPassword:next,confirmPassword:next,expectedVersion:security.version};
 await api('/auth/own-password',owner.accessToken,{...input,currentPassword:'synthetic-invalid-password'},401);checks.push('WRONG_CURRENT_PASSWORD_DENIED');
 fs.writeFileSync(recovery,JSON.stringify({account:state.teacher.email,originalPassword:old,newPassword:next}),{mode:0o600});
 const key=randomUUID(),saved=await api('/auth/own-password',owner.accessToken,input,201,key);changed=true;assert.deepEqual(await api('/auth/own-password',owner.accessToken,input,201,key),saved);
 assert.equal((await api('/me',owner.accessToken)).user.id,state.fixture.teacherUserId);await api('/me',other.accessToken,undefined,401);await api('/auth/refresh',null,{refreshToken:other.refreshToken},401);checks.push('PASSWORD_CHANGE_REPLAY_CURRENT_SESSION_RETAINED_OTHERS_REVOKED');
 await api('/auth/password-login',null,{account:state.teacher.email,password:old},401);const fresh=await login(next);assert.equal(fresh.user.id,state.fixture.teacherUserId);checks.push('NEW_PASSWORD_LOGIN_OLD_PASSWORD_DENIED');
 const current=await api('/auth/account-security',owner.accessToken);await api('/auth/own-password',owner.accessToken,{currentPassword:next,newPassword:old,confirmPassword:old,expectedVersion:current.version});changed=false;
 await api('/me',fresh.accessToken,undefined,401);const verified=await login(old);await api('/auth/logout',verified.accessToken,{refreshToken:verified.refreshToken},200);checks.push('ORIGINAL_TEST_PASSWORD_RESTORED');
}finally{
 if(changed){const current=await api('/auth/account-security',owner.accessToken);await api('/auth/own-password',owner.accessToken,{currentPassword:next,newPassword:old,confirmPassword:old,expectedVersion:current.version});checks.push('FINALLY_PASSWORD_RESTORED');}
 if(owner){state.teacherToken=owner.accessToken;fs.writeFileSync(path,JSON.stringify(state),{mode:0o600});}
 fs.writeFileSync(recovery,JSON.stringify({status:'RESTORED',observedAt:new Date().toISOString()}),{mode:0o600});
 const result={check:'CLOUD_SYNTHETIC_OWN_PASSWORD',observedAt:new Date().toISOString(),organizationId:state.fixture.organizationId,checks,allChecksCompleted:checks.includes('ORIGINAL_TEST_PASSWORD_RESTORED')};fs.writeFileSync('evidence/ocr-triplatform-20260913/cloud-own-password.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
