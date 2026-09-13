// Authorized synthetic subadmin governance; no email is sent.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const s=JSON.parse(fs.readFileSync('.local/ocr-triplatform-20260913-private.json')),checks=[];let created,deleted=false;
async function api(path,body,expected=body?201:200,token=s.adminToken,key=randomUUID()){
 const r=await fetch('https://www.teacher.bnbusports.cn/api/v1'+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':key},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 const v=await r.json();checks.push({path,status:r.status,expected,code:v.code??null,requestId:v.meta?.requestId??v.requestId});assert.equal(r.status,expected,JSON.stringify({status:r.status,code:v.code}));return v.data;
}
const result={check:'CLOUD_SUBADMIN_PROFILE_REGRESSION',organizationId:s.fixture.organizationId,checks};
try{
 assert.equal((await api('/me')).user.organizationId,s.fixture.organizationId);
 const suffix=randomUUID(),password=randomUUID();
 created=await api('/admin/subadmins',{email:`profile-${suffix}@example.test`,identityVerifiedByAdmin:true,account:`synthetic-profile-${suffix}`,name:'Synthetic profile before',department:'Synthetic department before',permissions:['AUDIT_QUERY'],initialPassword:password,confirmPassword:password});
 result.subadminId=created.id;
 const path=`/admin/subadmins/${created.id}/profile`,body={expectedVersion:created.version,name:'Synthetic profile after',department:'Synthetic department after',email:created.email,permissions:['COURSE_VIEW']};
 await api(path,body,403,s.teacherToken);
 const key=randomUUID(),updated=await api(path,body,201,s.adminToken,key);
 assert.equal(updated.version,created.version+1);assert.equal(updated.name,body.name);assert.equal(updated.department,body.department);assert.deepEqual(updated.permissions,body.permissions);
 assert.deepEqual(await api(path,body,201,s.adminToken,key),updated);
 await api(path,body,409);
 await api(path,{...body,expectedVersion:updated.version,email:`unverified-${suffix}@example.test`},401);
 const read=(await api('/admin/subadmins')).items.find(x=>x.id===created.id);
 assert.equal(read.version,updated.version);assert.equal(read.email,created.email);assert.equal(read.name,body.name);assert.deepEqual(read.permissions,body.permissions);
 result.result='PASS';result.assertions=['name department and permission update','same-key replay identical','stale version rejected','teacher denied','unverified email change rejected without mutation','persisted readback matched'];
}catch(e){result.result='FAIL';result.error=e.message;process.exitCode=1;}
finally{
 if(created)try{const row=(await api('/admin/subadmins')).items.find(x=>x.id===created.id);if(row)await api(`/admin/subadmins/${created.id}/delete`,{expectedVersion:row.version,handoverCompleted:true});deleted=!(await api('/admin/subadmins')).items.some(x=>x.id===created.id);}catch(e){result.cleanupError=e.message;process.exitCode=1;}
 result.cleanup=deleted?'TEST_ACCOUNT_DELETED':created?'CLEANUP_FAILED':'NO_ACCOUNT_CREATED';result.completedAt=new Date().toISOString();fs.writeFileSync('evidence/ocr-triplatform-20260913/subadmin-profile-regression.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({result:result.result,checks:checks.length,cleanup:result.cleanup,error:result.error}));
}
