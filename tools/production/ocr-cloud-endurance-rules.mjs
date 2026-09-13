// Synthetic organization rule CRUD; restores bands after the acceptance checks.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const path='.local/ocr-triplatform-20260913-private.json',s=JSON.parse(fs.readFileSync(path)),checks=[];
async function api(p,token,body,status=body?201:200,key=randomUUID()){const r=await fetch('https://www.teacher.bnbusports.cn/api/v1'+p,{method:body?'POST':'GET',headers:{...(token?{authorization:`Bearer ${token}`} : {}),'content-type':'application/json','idempotency-key':key},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});const v=await r.json();assert.equal(r.status,status,JSON.stringify({p,status:r.status,code:v.code}));return v.data;}
try{
 const auth=await api('/auth/password-login',null,{account:s.admin.email,password:s.admin.password},200);assert.equal(auth.user.organizationId,s.fixture.organizationId);s.adminToken=auth.accessToken;fs.writeFileSync(path,JSON.stringify(s),{mode:0o600});
 const base='/admin/endurance-tables',tables=await api(base,s.adminToken),table=tables[0],first=table.bands[0],{id,...band}=first;
 const identity={gender:table.gender,gradeGroup:table.gradeGroup,runType:table.runType},update={...identity,...band,note:'Synthetic cloud rule acceptance',expectedVersion:table.version},key=randomUUID();
 let current=await api(`${base}/rules/${id}`,s.adminToken,update,201,key);assert.deepEqual(await api(`${base}/rules/${id}`,s.adminToken,update,201,key),current);assert.equal(current.bands[0].note,update.note);checks.push('RULE_UPDATE_AND_REPLAY');
 const last=current.bands.at(-1),addition={...identity,minSeconds:last.maxSeconds+1,maxSeconds:last.maxSeconds+3,score:0,tier:'fail',note:'Synthetic appended band',expectedVersion:current.version};
 await api(`${base}/rules`,s.teacherToken,addition,403);current=await api(`${base}/rules`,s.adminToken,addition);const added=current.bands.at(-1);assert.equal(current.bands.length,table.bands.length+1);
 current=await api(`${base}/rules/${added.id}/delete`,s.adminToken,{...identity,expectedVersion:current.version});assert.equal(current.bands.length,table.bands.length);checks.push('RULE_CREATE_DELETE_TEACHER_DENIED');
 await api(`${base}/rules/${id}`,s.adminToken,update,409);await api(`${base}/rules/${id}`,s.adminToken,{...update,score:100,tier:'fail',expectedVersion:current.version},422);checks.push('STALE_AND_INCONSISTENT_RULE_REJECTED');
 current=await api(`${base}/rules/${id}`,s.adminToken,{...identity,...band,expectedVersion:current.version});assert.deepEqual(current.bands,table.bands);
 const final=await api(base,s.adminToken);assert.deepEqual(final.filter(row=>row.id!==table.id),tables.filter(row=>row.id!==table.id));checks.push('ORIGINAL_BANDS_AND_OTHER_TABLES_PRESERVED');
}finally{const result={check:'CLOUD_ENDURANCE_RULE_CRUD',observedAt:new Date().toISOString(),organizationId:s.fixture.organizationId,checks,allChecksCompleted:checks.includes('ORIGINAL_BANDS_AND_OTHER_TABLES_PRESERVED')};fs.writeFileSync('evidence/ocr-triplatform-20260913/cloud-endurance-rules.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
