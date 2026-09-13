import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const s=JSON.parse(fs.readFileSync('.local/ocr-triplatform-20260913-private.json')),file='.local/subadmin-browser-fixture.json';
async function api(path,body){const r=await fetch('https://www.teacher.bnbusports.cn/api/v1'+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${s.adminToken}`,'content-type':'application/json','idempotency-key':randomUUID()},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});const v=await r.json();assert.ok(r.ok,JSON.stringify({path,status:r.status,code:v.code}));return v.data;}
assert.equal((await api('/me')).user.organizationId,s.fixture.organizationId);
if(process.argv[2]==='create'){
 assert.ok(!fs.existsSync(file));const suffix=randomUUID(),password=randomUUID();
 const created=await api('/admin/subadmins',{email:`ui-profile-${suffix}@example.test`,identityVerifiedByAdmin:true,account:`synthetic-ui-${suffix}`,name:'Synthetic UI profile before',department:'Synthetic UI department before',permissions:['COURSE_VIEW'],initialPassword:password,confirmPassword:password});
 fs.writeFileSync(file,JSON.stringify(created),{flag:'wx',mode:0o600});console.log(JSON.stringify({created:created.id}));
}else if(process.argv[2]==='verify-cleanup'){
 const created=JSON.parse(fs.readFileSync(file)),row=(await api('/admin/subadmins')).items.find(x=>x.id===created.id);assert.ok(row);
 const pass=row.name==='Synthetic UI profile after'&&row.department==='Synthetic UI department after'&&row.email===created.email&&row.version===created.version+1;
 await api(`/admin/subadmins/${created.id}/delete`,{expectedVersion:row.version,handoverCompleted:true});assert.ok(!(await api('/admin/subadmins')).items.some(x=>x.id===created.id));
 const evidence={check:'SUBADMIN_PROFILE_BROWSER',observedAt:new Date().toISOString(),subadminId:created.id,pass,readback:{name:row.name,department:row.department,version:row.version},emailUnchanged:row.email===created.email,cleanup:'DELETED',scope:'Browser name and department update; email challenge not exercised'};
 fs.writeFileSync('evidence/ocr-triplatform-20260913/subadmin-profile-browser.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));assert.ok(pass);
}else throw new Error('Expected create or verify-cleanup');
