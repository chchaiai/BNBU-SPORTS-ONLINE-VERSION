import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {createTestPrisma} from '../../backend/test/helpers/database.ts';
const state=JSON.parse(fs.readFileSync('/workspace/.browser-state/state.json')),fixture=JSON.parse(fs.readFileSync('/workspace/.browser-state/closure-memberships-multi.json'));
const url=new URL('postgresql://sql-postgres:5432/v81_browser_test');url.username=process.env.PGUSER;url.password=process.env.PGPASSWORD;const db=createTestPrisma(url.href);
const api=async(path,token,body,key=randomUUID())=>{const r=await fetch('http://127.0.0.1:3199/api/v1'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','idempotency-key':key,...(token?{authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});const j=await r.json();assert.ok(r.ok,`${path}: ${r.status} ${j.code}`);return j.data;};
try{
 const token=(await api('/auth/password-login',null,{account:state.accounts.teacher.email,password:state.accounts.teacher.password})).accessToken;
 const before=await db.enrollment.findMany({where:{classSectionId:fixture.sectionId,status:'ACTIVE'}});assert.equal(before.length,3);
 const peer=before.find(e=>e.studentId!==fixture.student.studentId);await api(`/enrollments/${peer.id}/remove`,token,{reason:'Synthetic individual removal regression',expectedVersion:peer.version});
 const section=await api(`/class-sections/${fixture.sectionId}`,token),key=randomUUID(),body={reason:'Synthetic whole course closure regression',expectedVersion:section.version};
 const closed=await api(`/class-sections/${fixture.sectionId}/close`,token,body,key);assert.equal(closed.status,'CLOSED');
 const events=await db.enrollmentStatusEvent.count({where:{enrollmentId:{in:before.map(e=>e.id)},toStatus:'REMOVED'}});
 assert.equal(events,3);assert.deepEqual(await api(`/class-sections/${fixture.sectionId}/close`,token,body,key),closed);
 assert.equal(await db.enrollmentStatusEvent.count({where:{enrollmentId:{in:before.map(e=>e.id)},toStatus:'REMOVED'}}),events);
 const members=await db.enrollment.findMany({where:{classSectionId:fixture.sectionId}});assert.equal(members.length,3);assert.ok(members.every(e=>e.status==='REMOVED'));assert.equal(members.filter(e=>e.endReason==='COURSE_CLOSED').length,2);
 const profile=await fetch('http://127.0.0.1:3199/api/v1/students/'+fixture.student.studentId,{headers:{authorization:`Bearer ${token}`}});assert.equal(profile.status,404);
 await api(`/class-sections/${state.fixture.teacherAActiveSectionId}/enrollments`,token,{studentId:fixture.student.studentId,reason:'Synthetic join another course after closure'});
 assert.equal(await db.enrollment.count({where:{studentId:fixture.student.studentId,status:'ACTIVE'}}),1);
 console.log(JSON.stringify({check:'COURSE_CLOSURE_MEMBERSHIPS_HTTP_DB',result:'PASS',individualRemoved:1,autoRemoved:2,historicalMemberships:3,idempotentReplay:true,formerStudentProfileScopePreserved:true,joinAnotherCourse:true}));
}finally{await db.$disconnect();}
