import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createTestPrisma} from '../../backend/test/helpers/database.ts';
import {seedExerciseSessionStudent} from '../../backend/test/helpers/exercise-session.ts';
import {TEST_PASSWORD} from '../../backend/test/helpers/test-environment.ts';
const require=createRequire(new URL('../../backend/package.json',import.meta.url));
const state=JSON.parse(await fs.readFile('.local/demand-six-browser-state.json','utf8'));
const db=createTestPrisma('postgresql://bnbu_test:demand-local-test-only@127.0.0.1:55433/bnbu_sports_test?schema=public');
const base=state.baseUrl+'/api/v1';let checks=0;
async function call(path,token,body,expected=body?201:200,key=randomUUID()){
 const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','idempotency-key':key,...(token?{authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const result=await response.json();assert.equal(response.status,expected,JSON.stringify(result));checks++;return result.data;
}
async function upload(token,fileName,bytes){
 const item=await call('/feedback-attachments',token,{fileName,size:bytes.length});
 assert.equal((await fetch(item.url,{method:'PUT',headers:item.requiredHeaders,body:bytes})).status,200);
 await call(`/feedback-attachments/${item.id}/confirm`,token,{});return item;
}
try{
 await db.$executeRaw`INSERT INTO v81_account_security(user_id,organization_id,must_change_password) VALUES(${state.fixture.teacherBUserId}::uuid,${state.fixture.organizationId}::uuid,false) ON CONFLICT(user_id) DO UPDATE SET must_change_password=false`;
 const teacher=(await call('/auth/password-login',null,{account:state.fixture.teacherEmail,password:TEST_PASSWORD},200)).accessToken;
 const other=(await call('/auth/password-login',null,{account:state.fixture.teacherBEmail,password:TEST_PASSWORD},200)).accessToken;
 const admin=(await call('/auth/password-login',null,{account:state.fixture.adminEmail,password:TEST_PASSWORD},200)).accessToken;
 const studentData=await seedExerciseSessionStudent(db,state.fixture,'FEEDBACK-'+randomUUID(),'ACTIVE',false);
 await db.studentProfile.update({where:{id:studentData.studentId},data:{majorName:'未分流'}});
 const challenge=await call('/auth/student-sign-in-codes',null,{organizationCode:state.organizationCode,account:studentData.email,channel:'EMAIL',locale:'en'},202);
 let code;for(let i=0;i<30&&!code;i++){const m=await(await fetch('http://127.0.0.1:58025/api/v1/messages?limit=50')).json();const msg=m.messages?.find(x=>JSON.stringify(x.To).includes(studentData.email));if(msg){const detail=await(await fetch('http://127.0.0.1:58025/api/v1/message/'+msg.ID)).json();code=String(detail.Text??'').match(/(?:code is|验证码是)\s*(\d{4,10})/u)?.[1];}if(!code)await new Promise(r=>setTimeout(r,300));}assert.ok(code);
 const studentAuth=await call('/auth/student-sign-in-codes/verify',null,{challengeId:challenge.challengeId,code,deviceId:randomUUID()},200),student=studentAuth.accessToken;
 await call('/feedback-attachments',teacher,{fileName:'unsafe.html',size:10},415);
 await call('/feedback-attachments',teacher,{fileName:'huge.png',size:11*1024*1024},413);
 const png=await require('sharp')({create:{width:64,height:64,channels:3,background:'green'}}).png().toBuffer();
 const image=await upload(teacher,'问题截图.png',png),doc=await upload(teacher,'操作说明.txt',Buffer.from('Synthetic feedback attachment'));
 await call(`/feedback-attachments/${image.id}/confirm`,other,{},404);
 await call(`/feedback-attachments/${image.id}/access`,other,{},404);
 await call('/feedback',other,{category:'BUG',content:'Unauthorized attachment',attachmentIds:[image.id]},409);
 const key=randomUUID(),body={category:'BUG',content:'教师附件反馈验收 '+randomUUID(),attachmentIds:[image.id,doc.id]};
 const report=await call('/feedback',teacher,body,201,key);
 assert.deepEqual(await call('/feedback',teacher,body,201,key),report);
 await call('/feedback',teacher,{...body,content:'Cannot bind twice'},409);
 const own=await call(`/feedback/${report.id}/attachments`,teacher);assert.equal(own.items.length,2);
 await call(`/feedback/${report.id}/attachments`,other,null,404);
 await call(`/feedback/${report.id}/attachments`,student,null,404);
 const list=await call('/admin/feedback?search='+encodeURIComponent(body.content),admin);assert.equal(list.items.length,1);assert.equal(list.items[0].requester.role,'TEACHER');assert.ok(list.items[0].requester.name);
 const access=await call(`/feedback-attachments/${image.id}/access`,admin,{});
 assert.deepEqual(Buffer.from(await(await fetch(access.url)).arrayBuffer()),png);
 // Signed upload URLs can still be used; the accepted server-only snapshot remains unchanged.
 assert.equal((await fetch(image.url,{method:'PUT',headers:image.requiredHeaders,body:Buffer.alloc(png.length)})).status,200);
 assert.deepEqual(Buffer.from(await(await fetch(access.url)).arrayBuffer()),png);
 const download=await call(`/feedback-attachments/${doc.id}/access`,admin,{});const file=await fetch(download.url);
 assert.match(file.headers.get('content-disposition'),/^attachment/);assert.equal(file.headers.get('content-type'),'application/octet-stream');
 await db.v81AdminAccess.update({where:{userId:state.fixture.adminUserId},data:{kind:'SUB',permissions:['AUDIT_QUERY']}});
 try{await call(`/feedback-attachments/${doc.id}/access`,admin,{},403);}finally{await db.v81AdminAccess.update({where:{userId:state.fixture.adminUserId},data:{kind:'SUPER',permissions:[]}});}
 await call(`/admin/feedback/${report.id}/handling`,admin,{status:'RESOLVED',publicReply:'已收到教师附件，验收回复。',expectedVersion:report.version});
 const history=await call(`/student/feedback/${report.id}/history`,teacher);assert.equal(history.items.length,1);assert.equal(history.status,'RESOLVED');
 await call(`/student/feedback/${report.id}/history`,other,null,404);
 const studentImage=await upload(student,'学生截图.png',png);
 const studentReport=await call('/feedback',student,{category:'SUGGESTION',content:'学生反馈附件验收',attachmentIds:[studentImage.id]});
 assert.equal((await call(`/admin/feedback/${studentReport.id}`,admin)).requester.role,'STUDENT');
 const bad=await call('/feedback-attachments',student,{fileName:'invalid.png',size:16});await fetch(bad.url,{method:'PUT',headers:bad.requiredHeaders,body:Buffer.alloc(16)});await call(`/feedback-attachments/${bad.id}/confirm`,student,{},422);
 const summary={result:'PASS',checks,teacherSubmission:true,studentSubmission:true,sharedAdminQueue:true,privateAttachmentIsolation:true,immutableAcceptedObject:true,downloadDisposition:true,idempotency:true,teacherReplies:true,invalidMimeAndSizeDenied:true};
 await fs.mkdir('evidence/feedback-20260918',{recursive:true});await fs.writeFile('evidence/feedback-20260918/http.json',JSON.stringify(summary,null,2));
 await fs.writeFile('.local/feedback-test-state.json',JSON.stringify({teacher,admin,studentAuth,studentData,teacherReport:report.id,studentReport:studentReport.id}));console.log(JSON.stringify(summary));
}finally{await db.$disconnect();}
