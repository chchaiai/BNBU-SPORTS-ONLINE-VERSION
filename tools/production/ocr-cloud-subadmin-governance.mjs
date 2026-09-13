import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const staff=JSON.parse(fs.readFileSync('.local/ocr-triplatform-20260913-private.json'));
const checks=[], evidence={check:'CLOUD_SUBADMIN_GOVERNANCE',organizationId:staff.fixture.organizationId,checks};
const routes={COURSE_VIEW:'/admin/course-directory',SEMESTER_MANAGE:'/admin/semesters',USER_ACCOUNTS:'/admin/teacher-accounts',STUDENT_FEEDBACK:'/admin/feedback',GLOBAL_RULES:'/admin/endurance-tables',SYSTEM_MODE:'/system-mode/history',HELP_CENTER:'/admin/help-articles',AUDIT_QUERY:'/admin/audit-events'};
async function api(path,body,expected=body?201:200,token=staff.adminToken,key=randomUUID()) {
  const r=await fetch('https://www.teacher.bnbusports.cn/api/v1'+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':key},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
  const v=await r.json();checks.push({path,status:r.status,expected,requestId:v.meta?.requestId??v.requestId});
  assert.equal(r.status,expected,JSON.stringify({path,status:r.status,code:v.code}));return v.data;
}
let created,version,deleted=false;
try {
  assert.equal((await api('/me')).user.organizationId,staff.fixture.organizationId);
  const suffix=randomUUID(),initialPassword=randomUUID(),password=randomUUID();
  const body={email:`governance-${suffix}@example.test`,identityVerifiedByAdmin:true,account:`synthetic-${suffix}`,name:'Synthetic permission governance',department:'Synthetic test organization',permissions:['AUDIT_QUERY'],initialPassword,confirmPassword:initialPassword};
  await api('/admin/subadmins',body,403,staff.teacherToken);
  const key=randomUUID();created=await api('/admin/subadmins',body,201,staff.adminToken,key);version=created.version;evidence.subadminId=created.id;
  assert.deepEqual(await api('/admin/subadmins',body,201,staff.adminToken,key),created);
  const login=await api('/auth/password-login',{account:body.account,password:initialPassword},200);
  const security=await api('/auth/account-security',undefined,200,login.accessToken);assert.equal(security.mustChangePassword,true);
  await api('/admin/audit-events',undefined,403,login.accessToken);
  await api('/auth/own-password',{currentPassword:initialPassword,newPassword:password,confirmPassword:password,expectedVersion:security.version},201,login.accessToken);
  await api('/admin/audit-events',undefined,200,login.accessToken);
  const p=`/admin/subadmins/${created.id}`;
  version=(await api('/admin/subadmins')).items.find(x=>x.id===created.id).version;
  for(const permission of Object.keys(routes)) {
    const input={expectedVersion:version,permissions:[permission]},grantKey=randomUUID();
    const grant=await api(p+'/permissions',input,201,staff.adminToken,grantKey);version=grant.version;
    assert.deepEqual(await api(p+'/permissions',input,201,staff.adminToken,grantKey),grant);
    await api(p+'/permissions',input,409);
    for(const [required,route] of Object.entries(routes))await api(route,undefined,required===permission?200:403,login.accessToken);
    await api('/admin/subadmins',undefined,403,login.accessToken);
  }
  version=(await api(p+'/permissions',{expectedVersion:version,permissions:[]})).version;
  for(const route of Object.values(routes))await api(route,undefined,403,login.accessToken);
  await api(p+'/status',{status:'DISABLED',expectedVersion:version},422);
  const disable={status:'DISABLED',expectedVersion:version,handoverCompleted:true},disableKey=randomUUID();
  const disabled=await api(p+'/status',disable,201,staff.adminToken,disableKey);version=disabled.version;
  assert.deepEqual(await api(p+'/status',disable,201,staff.adminToken,disableKey),disabled);
  await api('/auth/account-security',undefined,401,login.accessToken);
  await api(p+'/status',{status:'ACTIVE',expectedVersion:version-1},409);
  version=(await api(p+'/status',{status:'ACTIVE',expectedVersion:version})).version;
  const resumed=await api('/auth/password-login',{account:body.account,password},200);
  version=(await api(p+'/permissions',{expectedVersion:version,permissions:['AUDIT_QUERY']})).version;
  await api('/admin/audit-events',undefined,200,resumed.accessToken);
  await api(p+'/delete',{expectedVersion:version,handoverCompleted:false},422);
  await api(p+'/delete',{expectedVersion:version,handoverCompleted:true},403,staff.teacherToken);
  const deletion={expectedVersion:version,handoverCompleted:true},deleteKey=randomUUID();
  const result=await api(p+'/delete',deletion,201,staff.adminToken,deleteKey);assert.equal(result.deleted,true);deleted=true;
  assert.deepEqual(await api(p+'/delete',deletion,201,staff.adminToken,deleteKey),result);
  await api('/auth/account-security',undefined,401,resumed.accessToken);
  assert.ok(!(await api('/admin/subadmins')).items.some(x=>x.id===created.id));
  evidence.result='PASS';evidence.assertions=['64 single permission matrix checks','8 revoked permission checks on existing session','replay and stale versions','mandatory initial password change preserves current session','disable revokes session; enable permits new login','superadmin boundary','handover required; deletion replay and account absence'];
} catch(error) {evidence.result='FAIL';evidence.error=error.message;process.exitCode=1;}
finally {
  if(created&&!deleted)try {const row=(await api('/admin/subadmins')).items.find(x=>x.id===created.id);if(row){await api(`/admin/subadmins/${created.id}/delete`,{expectedVersion:row.version,handoverCompleted:true});}deleted=true;}catch(error){evidence.cleanupError=error.message;}
  evidence.cleanup=deleted?'TEST_ACCOUNT_DELETED':created?'CLEANUP_FAILED':'NO_ACCOUNT_CREATED';evidence.allChecksCompleted=evidence.result==='PASS'&&deleted;evidence.completedAt=new Date().toISOString();
  fs.writeFileSync('evidence/ocr-triplatform-20260913/cloud-subadmin-governance.json',JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({check:evidence.check,result:evidence.result,checks:checks.length,cleanup:evidence.cleanup,error:evidence.error}));
}
