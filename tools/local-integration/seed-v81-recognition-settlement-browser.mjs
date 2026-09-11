import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestPrisma } from '../../backend/test/helpers/database.ts';
const fixtureName=process.env.V81_RECOGNITION_FIXTURE??'recognition-settlement-browser';assert.match(fixtureName,/^[a-z0-9-]+$/);
process.env.V81_SEMESTER_FIXTURE=fixtureName;
await import('./seed-v81-semester-switch-browser.mjs');
const file=`/workspace/.browser-state/${fixtureName}.json`;
const state=JSON.parse(fs.readFileSync(file));
const url=new URL('postgresql://sql-postgres:5432/v81_browser_test');url.username=process.env.PGUSER;url.password=process.env.PGPASSWORD;
const prisma=createTestPrisma(url.href),save=()=>fs.writeFileSync(file,JSON.stringify(state,null,2),{mode:0o600});
const api=async(path,token,body)=>{const response=await fetch('http://127.0.0.1:3199/api/v1'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','idempotency-key':randomUUID(),...(token?{authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();assert.ok(response.ok,`${path}: ${response.status} ${result.error?.code}`);return result.data;};
try{
 assert.equal((await prisma.$queryRaw`SELECT current_database() AS name`)[0].name,'v81_browser_test');
 if(!state.application){
  const org=await prisma.organization.findUniqueOrThrow({where:{id:state.fixture.organizationId}});
  const old=await(await fetch('http://mailpit:8025/api/v1/messages?limit=50')).json(),oldIds=new Set((old.messages??[]).map(m=>m.ID));
  const challenge=await api('/auth/student-sign-in-codes',null,{organizationCode:org.organizationCode,account:state.student.email,channel:'EMAIL',locale:'zh-CN'});
  let code;for(let i=0;i<30&&!code;i++){const messages=await(await fetch('http://mailpit:8025/api/v1/messages?limit=50')).json(),message=messages.messages?.find(m=>!oldIds.has(m.ID)&&JSON.stringify(m.To).includes(state.student.email));if(message){const mail=await(await fetch(`http://mailpit:8025/api/v1/message/${message.ID}`)).json();code=mail.Text?.match(/\b\d{6}\b/)?.[0];}if(!code)await new Promise(r=>setTimeout(r,500));}
  assert.ok(code);const studentLogin=await api('/auth/student-sign-in-codes/verify',null,{challengeId:challenge.challengeId,code,deviceId:randomUUID()});
  const id=randomUUID(),now=new Date(),digest='b'.repeat(64);
  await prisma.mediaEvidence.create({data:{id,organizationId:state.fixture.organizationId,ownerStudentId:state.student.studentId,enrollmentId:state.student.enrollmentId,initiatedByUserId:state.student.userId,businessPurpose:'EXEMPTION_APPLICATION',mediaType:'IMAGE',captureSource:'FILE_PICKER',declaredMimeType:'image/png',verifiedMimeType:'image/png',declaredFileSizeBytes:45n,verifiedFileSizeBytes:45n,declaredContentSha256:digest,verifiedContentSha256:digest,uploadStatus:'AVAILABLE',storageKey:`synthetic/${id}/evidence.png`,uploadedAt:now,boundAt:now,processingStartedAt:now,availableAt:now,createdAt:now,updatedAt:now}});
  const draft=await api('/exemption-applications',studentLogin.accessToken,{enrollmentId:state.student.enrollmentId,applicationType:'EXERCISE_CHECK_IN',applicationSubtype:'SCHOOL_TEAM',organizationName:'Synthetic settled team',reason:'Synthetic recognition before settlement',mediaIds:[id]});
  state.application=await api(`/exemption-applications/${draft.id}/submit`,studentLogin.accessToken,{expectedVersion:draft.version});save();
 }
 const teacher=await api('/auth/password-login',null,{account:state.accounts.teacher.email,password:state.accounts.teacher.password});
 const current=await api(`/exemption-applications/${state.application.id}`,teacher.accessToken);
 if(current.status==='SUBMITTED'){state.application=await api(`/exemption-applications/${current.id}/review`,teacher.accessToken,{expectedVersion:current.version,decision:'APPROVE',publicComment:'Synthetic original recognized fact',courseMinutes:30,generalMinutes:15});save();}
 console.log(JSON.stringify({check:'RECOGNITION_SETTLEMENT_BROWSER_PREREQUISITES',result:'PASS',syntheticMediaMetadata:true,approvalViaHttp:true}));
}finally{await prisma.$disconnect();}
