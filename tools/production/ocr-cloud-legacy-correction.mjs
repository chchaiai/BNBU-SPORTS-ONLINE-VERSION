// Correct DTO and owned synthetic resource; distinguish disabled correction from missing resource.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const staffPath='.local/ocr-triplatform-20260913-private.json';
const staff=JSON.parse(fs.readFileSync(staffPath));
const fixture=JSON.parse(fs.readFileSync('evidence/ocr-triplatform-20260913/legacy-score-probe-fixture.json')).row;
const base='https://www.teacher.bnbusports.cn/api/v1';
const login=await fetch(base+'/auth/password-login',{method:'POST',headers:{'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify({account:staff.teacher.email,password:staff.teacher.password}),signal:AbortSignal.timeout(20000)});
assert.equal(login.status,200);staff.teacherToken=(await login.json()).data.accessToken;
fs.writeFileSync(staffPath,JSON.stringify(staff),{mode:0o600});
const checks=[];
for(const expectedVersion of [fixture.version+1,fixture.version]) {
  const r=await fetch(base+`/student-scores/${fixture.id}/open-correction`,{method:'POST',headers:{authorization:`Bearer ${staff.teacherToken}`,'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify({expectedVersion,reason:'Synthetic disabled correction acceptance probe'}),signal:AbortSignal.timeout(15000)});
  const value=await r.json();
  assert.equal(r.status,409,JSON.stringify({status:r.status,code:value.code}));
  assert.equal(value.code,expectedVersion===fixture.version?'SCORE_CORRECTION_NOT_ALLOWED':'CONFLICT_VERSION_MISMATCH');
  checks.push({operationId:'openStudentScoreCorrection',expectedVersion,status:r.status,code:value.code,requestId:value.requestId,disabledGateObserved:value.code==='SCORE_CORRECTION_NOT_ALLOWED'});
}
const result={check:'CLOUD_LEGACY_CORRECTION_DENIAL',observedAt:new Date().toISOString(),productionRelease:'portal-required-20260913',organizationId:fixture.organizationId,scoreId:fixture.id,checks,allChecksCompleted:true};
fs.writeFileSync('evidence/ocr-triplatform-20260913/cloud-legacy-correction.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
