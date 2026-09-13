import fs from 'node:fs';import assert from 'node:assert/strict';
const f=JSON.parse(fs.readFileSync('.local/v81-browser-state/demand-fixture.json'));
const base='http://127.0.0.1:3199/api/v1';
const login=await fetch(base+'/auth/password-login',{method:'POST',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({account:f.teacherEmail,password:f.password})});assert.equal(login.status,200);const token=(await login.json()).data.accessToken;
const get=async path=>{const r=await fetch(base+path,{headers:{authorization:'Bearer '+token}});assert.equal(r.status,200);const d=(await r.json()).data;return Array.isArray(d)?d:d.items;};
const list=await get('/exercise-records?limit=100');const enrollments=await get('/enrollments?limit=100');
const active=new Set(enrollments.filter(e=>e.status==='ACTIVE').map(e=>e.id));assert.ok(list.every(r=>active.has(r.enrollmentId)));assert.ok(!list.some(r=>r.id===f.recordId));
console.log(JSON.stringify({check:'TEACHER_RECORD_LIST_EXCLUDES_REMOVED_MEMBERS',result:'PASS'}));
