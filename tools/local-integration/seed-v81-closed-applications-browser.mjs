import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createTestPrisma} from '../../backend/test/helpers/database.ts';
import {seedExerciseSessionStudent} from '../../backend/test/helpers/exercise-session.ts';
const uuid=createRequire(new URL('../../backend/package.json',import.meta.url))('uuid').v7;
const run=process.env.V81_CLOSED_APPS_RUN??'initial';assert.match(run,/^[a-z0-9-]+$/);
const dir='/workspace/.browser-state',base=JSON.parse(fs.readFileSync(dir+'/state.json')),file=dir+`/closed-applications-${run}.json`;
assert.equal(base.database,'v81_browser_test');
const url=new URL('postgresql://sql-postgres:5432/v81_browser_test');url.username=process.env.PGUSER;url.password=process.env.PGPASSWORD;
const prisma=createTestPrisma(url.href);
const api=async(path,token,body)=>{const response=await fetch('http://127.0.0.1:3199/api/v1'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','idempotency-key':randomUUID(),...(token?{authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();assert.ok(response.ok,`${path}: ${response.status} ${result.code}`);return result.data;};
try{
 assert.equal((await prisma.$queryRaw`SELECT current_database() AS name`)[0].name,'v81_browser_test');
 if(!fs.existsSync(file)){
  const source=await prisma.classSection.findUniqueOrThrow({where:{id:base.fixture.teacherAActiveSectionId}}),sectionId=uuid();
  await prisma.$transaction(async tx=>{
   await tx.classSection.create({data:{...source,id:sectionId,classCode:'SYNTH-CLOSED-APPS-'+run,displayName:'Synthetic closed applications',version:1,createdAt:new Date(),updatedAt:new Date()}});
   await tx.$executeRaw`INSERT INTO v81_course_rules(class_section_id,organization_id,minimum_minutes,weekly_limit,course_target,general_target,regular_deadline,closing_deadline,settlement_planned_at,published_at,version,template_id) SELECT ${sectionId}::uuid,organization_id,minimum_minutes,weekly_limit,course_target,general_target,regular_deadline,closing_deadline,settlement_planned_at,now(),1,template_id FROM v81_course_rules WHERE class_section_id=${source.id}::uuid`;
  });
  const student=await seedExerciseSessionStudent(prisma,{...base.fixture,teacherAActiveSectionId:sectionId},randomUUID().slice(0,8).toUpperCase(),'ACTIVE',false);
  fs.writeFileSync(file,JSON.stringify({sectionId,student,applications:[]}),{mode:0o600});
 }
 if(process.env.V81_APPS_FIXTURE_ONLY==='1'){console.log(JSON.stringify({check:'APPLICATION_UPLOAD_FIXTURE',result:'PASS',noApplicationSeeded:true}));}else{
 const fixture=JSON.parse(fs.readFileSync(file)),save=()=>fs.writeFileSync(file,JSON.stringify(fixture),{mode:0o600});
 const organization=await prisma.organization.findUniqueOrThrow({where:{id:base.fixture.organizationId}});
 const old=await(await fetch('http://mailpit:8025/api/v1/messages?limit=50')).json(),oldIds=new Set((old.messages??[]).map(m=>m.ID));
 const challenge=await api('/auth/student-sign-in-codes',null,{organizationCode:organization.organizationCode,account:fixture.student.email,channel:'EMAIL',locale:'zh-CN'});
 let code;
 for(let i=0;i<30&&!code;i++){const messages=await(await fetch('http://mailpit:8025/api/v1/messages?limit=50')).json(),message=messages.messages?.find(m=>!oldIds.has(m.ID)&&JSON.stringify(m.To).includes(fixture.student.email));if(message){const mail=await(await fetch(`http://mailpit:8025/api/v1/message/${message.ID}`)).json();code=mail.Text?.match(/\b\d{6}\b/)?.[0];}if(!code)await new Promise(r=>setTimeout(r,500));}
 assert.ok(code);const login=await api('/auth/student-sign-in-codes/verify',null,{challengeId:challenge.challengeId,code,deviceId:randomUUID()});
 for(const [applicationType,applicationSubtype] of [['PHYSICAL_TEST','RUN_800M'],['EXERCISE_CHECK_IN','SCHOOL_TEAM']]){
  if(fixture.applications.some(item=>item.applicationType===applicationType))continue;
  const id=uuid(),now=new Date(),digest=createHash('sha256').update('Synthetic application evidence').digest('hex');
  await prisma.mediaEvidence.create({data:{id,organizationId:base.fixture.organizationId,ownerStudentId:fixture.student.studentId,enrollmentId:fixture.student.enrollmentId,initiatedByUserId:fixture.student.userId,businessPurpose:'EXEMPTION_APPLICATION',mediaType:'IMAGE',captureSource:'FILE_PICKER',declaredMimeType:'image/png',verifiedMimeType:'image/png',declaredFileSizeBytes:45n,verifiedFileSizeBytes:45n,declaredContentSha256:digest,verifiedContentSha256:digest,uploadStatus:'AVAILABLE',storageKey:`synthetic/${id}/evidence.png`,uploadedAt:now,boundAt:now,processingStartedAt:now,availableAt:now,createdAt:now,updatedAt:now}});
  const draft=await api('/exemption-applications',login.accessToken,{enrollmentId:fixture.student.enrollmentId,applicationType,applicationSubtype,organizationName:applicationType==='EXERCISE_CHECK_IN'?'Synthetic closed team':null,reason:`Synthetic closed ${applicationType}`,mediaIds:[id]});
  const submitted=await api(`/exemption-applications/${draft.id}/submit`,login.accessToken,{expectedVersion:draft.version});
  fixture.applications.push(submitted);save();
 }
 console.log(JSON.stringify({check:'CLOSED_APPLICATIONS_FIXTURE',result:'PASS',realHttpSubmitted:fixture.applications.length,syntheticMediaMetadata:true}));
 }
}finally{await prisma.$disconnect();}
