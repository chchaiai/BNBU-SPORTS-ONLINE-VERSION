import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {request as httpRequest} from 'node:http';
import {writeFileSync} from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(new URL('../../backend/package.json',import.meta.url));
const {PDFDocument}=require('pdf-lib');
const sharp=require('sharp');
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createTestPrisma, seedFoundationFixture } from '../../backend/test/helpers/database.ts';
import { TEST_PASSWORD } from '../../backend/test/helpers/test-environment.ts';

const database = new URL('postgresql://sql-postgres:5432/v81_browser_test');
database.username = process.env.PGUSER; database.password = process.env.PGPASSWORD;
const db = createTestPrisma(database.href), base = 'http://127.0.0.1:3199/api/v1';
async function api(path, token, body, headers = {}) {
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID(),
      ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json();
  return { status: response.status, data: value.data, errorCode: response.ok ? undefined : JSON.stringify({code:value.code,error:value.error,details:value.details,message:value.message}) };
}
const pass = check => console.log(JSON.stringify({ check, result: 'PASS' }));
try {
  assert.equal((await db.$queryRaw`SELECT current_database() AS name`)[0].name, 'v81_browser_test');
  const fixture = await seedFoundationFixture(db, `PROFILE-${randomUUID().slice(0, 6).toUpperCase()}`);
  await db.classSection.update({ where: { id: fixture.teacherAActiveSectionId }, data: { isEnrollmentOpen: true } });
  await db.v81AccountSecurity.create({ data: { userId: fixture.teacherUserId, organizationId: fixture.organizationId,
    mustChangePassword: false, passwordChangedAt: new Date() } });
  const teacherLogin = await api('/auth/password-login', null, { account: fixture.teacherEmail, password: TEST_PASSWORD });
  assert.equal(teacherLogin.status, 200, teacherLogin.errorCode);
  const teacher = teacherLogin.data.accessToken;
  async function invite(sectionId) {
    const result = await api(`/class-sections/${sectionId}/course-invites`, teacher, {});
    assert.equal(result.status, 201, result.errorCode);
    return result.data.inviteToken;
  }
  const firstInvite = await invite(fixture.teacherAActiveSectionId);
  const identity = { fullName: 'Synthetic Permanent Student', studentNumber: `P-${randomUUID().slice(0, 8).toUpperCase()}`,
    gender: 'FEMALE', gradeYear: 2026, collegeName: 'Synthetic College', majorName: 'Computing', dateOfBirth: '2004-02-29', regionCode: 'HK' };
  async function join(token, memberToken) {
    const capability = await api(`/course-invites/${token}/join-capabilities${memberToken ? '/member' : ''}`, memberToken, identity);
    assert.equal(capability.status, 201, capability.errorCode);
    const result = await api(`/course-invites/${token}/join`, null, {}, { 'x-join-capability': capability.data.joinCapability });
    assert.equal(result.status, 201, result.errorCode);
    return result.data;
  }
  const first = await join(firstInvite);
  let studentToken = first.authSession.accessToken;
  let me=(await api('/me',studentToken)).data;
  const email = `demand-${randomUUID().slice(0, 8)}@mail.bnbu.edu.cn`;
  const challenge = await api('/me/email-verification-challenges', studentToken, { email, locale: 'en', expectedVersion: me.user.version });
  assert.equal(challenge.status, 202, challenge.errorCode);
  assert.equal(challenge.data.mode, 'FIRST_BIND');
  let code;
  for (let attempt = 0; attempt < 30 && !code; attempt++) {
    const messages = await (await fetch('http://mailpit:8025/api/v1/messages?limit=100')).json();
    for (const message of messages.messages) {
      if (!JSON.stringify(message.To).toLowerCase().includes(email)) continue;
      const content = await (await fetch(`http://mailpit:8025/api/v1/message/${message.ID}`)).json();
      code = content.Text.match(/\b\d{6}\b/)?.[0];
    }
    if (!code) await delay(1000);
  }
  assert.ok(code, 'local Mailpit verification code delivered');
  const bound = await api(`/me/email-verification-challenges/${challenge.data.challengeId}/verify`, studentToken, { newEmailCode: code });
  assert.equal(bound.status, 200, bound.errorCode);
  me = (await api('/me', studentToken)).data;
  assert.equal(me.user.emailVerified, true);
  pass('FIRST_EMAIL_BINDING_REAL_SMTP');

  const enrollmentId=first.enrollment.id,sectionId=fixture.teacherAActiveSectionId;
  const regular=new Date(Date.now()+70*86400000),closing=new Date(regular.getTime()+7*86400000);
  await db.classSection.update({where:{id:sectionId},data:{checkInStartDate:new Date('2026-08-01T00:00:00Z'),checkInEndDate:new Date(regular.getTime()-86400000),dailyStartTime:new Date('1970-01-01T00:00:00Z'),dailyEndTime:new Date('1970-01-01T23:59:00Z'),checkInWindowMode:'AVAILABLE'}});
  await db.v81AccountSecurity.create({data:{userId:fixture.adminUserId,organizationId:fixture.organizationId,mustChangePassword:false,passwordChangedAt:new Date()}});
  await db.v81AdminAccess.create({data:{userId:fixture.adminUserId,organizationId:fixture.organizationId,kind:'SUPER',permissions:[],mustChangePassword:false}});
  const admin=(await api('/auth/password-login',null,{account:fixture.adminEmail,password:TEST_PASSWORD})).data.accessToken;
  const template=await api('/rule-templates',admin,{displayName:'Synthetic demand rules',expectedVersion:0});
  assert.equal(template.status,201,template.errorCode);
  const rules=await api(`/class-sections/${sectionId}/v81-rules`,teacher,{templateId:template.data.id,minimumMinutes:35,weeklyLimit:5,dailyLimit:2,courseTarget:600,generalTarget:600,regularDeadline:regular.toISOString(),closingDeadline:closing.toISOString(),settlementPlannedAt:closing.toISOString(),publish:true,expectedVersion:0});
  assert.equal(rules.status,201,rules.errorCode);
  let settings=await api(`/class-sections/${sectionId}/history-settings`,studentToken);
  assert.equal(settings.status,200,settings.errorCode);assert.equal(settings.data.enabled,false);
  assert.equal((await api(`/class-sections/${sectionId}/history-settings`,studentToken,{enabled:true,earliestDate:'2026-08-01',latestDate:'2026-12-01',expectedVersion:0})).status,403);
  const saved=await api(`/class-sections/${sectionId}/history-settings`,teacher,{enabled:true,earliestDate:'2026-08-01',latestDate:'2026-12-01',expectedVersion:0});
  assert.equal(saved.status,201,saved.errorCode);
  const sessionPath=`/enrollments/${enrollmentId}/historical-sessions`;
  assert.equal((await api(sessionPath,studentToken,{startedAt:new Date(Date.now()+86400000).toISOString(),durationSeconds:3600})).status,422);
  assert.equal((await api(sessionPath,studentToken,{startedAt:'2026-07-30T12:00:00+08:00',durationSeconds:3600})).status,422);
  const past=new Date(Date.now()-86400000).toISOString().slice(0,10);
  const created=await api(sessionPath,studentToken,{startedAt:`${past}T12:00:00+08:00`,durationSeconds:3600});
  assert.equal(created.status,201,created.errorCode);assert.equal(created.data.recordOrigin,'HISTORICAL');
  pass('TEACHER_RANGE_STUDENT_PAST_DATE_AND_CUSTOM_RULES');
  const sessionId=created.data.id;
  const draft=await api('/exercise-records',studentToken,{sessionId,creditType:'GENERAL',sportType:'YOGA',description:'Synthetic historical yoga evidence',clientRequestId:randomUUID()});
  assert.equal(draft.status,201,draft.errorCode);
  const recordId=draft.data.id;
  assert.ok((await api(`/exercise-records/${recordId}/submit`,studentToken,{expectedVersion:1,mediaIds:[]})).status>=400);
  async function upload(body,mimeType,purpose='EXERCISE_RECORD') {
    const mediaType=mimeType==='application/pdf'?'DOCUMENT':'IMAGE';
    const initiated=await api('/media-uploads',studentToken,{...(purpose==='EXERCISE_RECORD'?{sessionId}:{enrollmentId}),businessPurpose:purpose,mediaType,mimeType,
      fileSizeBytes:body.length,declaredContentSha256:createHash('sha256').update(body).digest('hex'),durationSeconds:null,captureSource:'FILE_PICKER'});
    assert.equal(initiated.status,201,initiated.errorCode);
    const objectUrl=new URL(initiated.data.uploadUrl),signedHost=objectUrl.host;objectUrl.hostname='media-minio';objectUrl.port='9000';
    const put=await new Promise((resolve,reject)=>{const req=httpRequest(objectUrl,{method:'PUT',headers:{...initiated.data.requiredHeaders,host:signedHost,'content-length':body.length}},res=>{res.resume();res.on('end',()=>resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode,headers:{get:name=>res.headers[name.toLowerCase()]}}));});req.on('error',reject);req.end(body);});
    assert.ok(put.ok,`PUT ${put.status}`);
    const confirmed=await api(`/media-uploads/${initiated.data.uploadSessionId}/confirm`,studentToken,{etag:put.headers.get('etag').replaceAll('"','')});
    assert.equal(confirmed.status,200,confirmed.errorCode);
    if(purpose==='EXERCISE_RECORD') {
      const bound=await api(`/media/${initiated.data.mediaId}/bind`,studentToken,{sessionId,expectedVersion:confirmed.data.version});
      assert.equal(bound.status,200,bound.errorCode);
      for(let i=0;i<40;i++){const m=await api(`/media/${initiated.data.mediaId}`,studentToken);if(m.data?.uploadStatus==='AVAILABLE')return m.data;assert.notEqual(m.data?.uploadStatus,'FAILED');await delay(250);}
      throw new Error('media verification timeout');
    }
    return confirmed.data;
  }
  const photo=await sharp({create:{width:8,height:8,channels:3,background:'#456789'}}).jpeg().withExif({IFD0:{Make:'Synthetic Camera',Model:'Docker'},IFD2:{DateTimeOriginal:`${past.replaceAll('-',':')} 12:00:00`}}).toBuffer();
  const media=await upload(photo,'image/jpeg');
  assert.equal(media.safeMetadata.Make,'Synthetic Camera');
  await db.v81ManualMode.create({data:{classSectionId:sectionId,organizationId:fixture.organizationId,
    enabled:false,reason:'Synthetic historical records must bypass the AI queue',updatedAt:new Date()}});
  const submitted=await api(`/exercise-records/${recordId}/submit`,studentToken,{expectedVersion:1,mediaIds:[media.id]});
  assert.equal(submitted.status,200,submitted.errorCode);
  const workflow=(await api(`/exercise-records/${recordId}/workflow`,teacher));
  assert.equal(workflow.status,200,workflow.errorCode);assert.equal(workflow.data.stage,'PENDING_TEACHER');
  pass('HISTORICAL_REQUIRES_TEACHER_EVEN_WHEN_COURSE_MANUAL_MODE_DISABLED');
  const reviewed=await api(`/exercise-records/${recordId}/v81-reviews`,teacher,{action:'VALID',expectedVersion:workflow.data.version});
  assert.equal(reviewed.status,201,reviewed.errorCode);
  const records=await api('/exercise-records?limit=50',studentToken);
  const record=(Array.isArray(records.data)?records.data:records.data.items).find(r=>r.id===recordId);
  assert.equal(record.recordOrigin,'HISTORICAL');assert.equal(record.businessDate,past);
  assert.equal((await db.$queryRaw`SELECT credited_minutes FROM v81_credit_projections WHERE record_id=${recordId}::uuid`)[0].credited_minutes,60);
  pass('HISTORICAL_PHOTO_UPLOAD_TEACHER_REVIEW_CREDIT_AND_EXIF');
  const pdf=await PDFDocument.create();pdf.addPage([200,200]);
  const document=await upload(Buffer.from(await pdf.save()),'application/pdf','EXEMPTION_APPLICATION');
  assert.equal(document.verifiedMimeType,'application/pdf');assert.equal(document.safeMetadata.pageCount,1);
  const application=await api('/exemption-applications',studentToken,{enrollmentId,applicationType:'EXERCISE_CHECK_IN',applicationSubtype:'SCHOOL_TEAM',organizationName:'Synthetic Team',reason:'Synthetic PDF supporting document',mediaIds:[document.id]});
  assert.equal(application.status,201,application.errorCode);
  for(let i=0;i<40;i++){const m=await api(`/media/${document.id}`,studentToken);if(m.data?.uploadStatus==='AVAILABLE')break;await delay(250);}
  const appSubmitted=await api(`/exemption-applications/${application.data.id}/submit`,studentToken,{expectedVersion:application.data.version});
  assert.equal(appSubmitted.status,200,appSubmitted.errorCode);
  const appReviewed=await api(`/exemption-applications/${application.data.id}/review`,teacher,{decision:'APPROVE',publicComment:'Synthetic PDF verified',courseMinutes:120,generalMinutes:0,expectedVersion:appSubmitted.data.version});
  assert.equal(appReviewed.status,200,appReviewed.errorCode);
  pass('EXEMPTION_PDF_UPLOAD_SUBMIT_AND_TEACHER_APPROVAL');
  writeFileSync('/workspace/.browser-state/demand-fixture.json',JSON.stringify({organizationCode:(await db.organization.findUniqueOrThrow({where:{id:fixture.organizationId}})).organizationCode,teacherEmail:fixture.teacherEmail,adminEmail:fixture.adminEmail,password:TEST_PASSWORD,studentEmail:email,sectionId,enrollmentId,recordId,studentId:me.studentProfile.id,past}));
  writeFileSync('/workspace/.browser-state/demand-photo.jpg',photo);
  writeFileSync('/workspace/.browser-state/demand-proof.pdf',Buffer.from(await pdf.save()));
  console.log(JSON.stringify({check:'DEMAND_BACKFILL_MEDIA_HTTP_DATABASE',result:'PASS'}));
} finally {await db.$disconnect();}
