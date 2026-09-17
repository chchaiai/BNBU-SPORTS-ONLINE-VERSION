import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {SignJWT,importPKCS8} from 'jose';
import {createTestPrisma,seedFoundationFixture} from './helpers/database.ts';
import {seedExerciseSessionStudent} from './helpers/exercise-session.ts';
import {foundationEnvironment,TEST_PRIVATE_KEY,TEST_PASSWORD,requireTestDatabaseUrl} from './helpers/test-environment.ts';
const url=requireTestDatabaseUrl(),db=createTestPrisma(url),port=Number(process.env.QUALITY_TEST_PORT || 3297),base=`http://127.0.0.1:${port}/api/v1`;
const f=await seedFoundationFixture(db,'Q'+randomUUID().slice(0,6).toUpperCase());
const student=await seedExerciseSessionStudent(db,f,randomUUID().slice(0,5).toUpperCase());
await db.classSection.update({where:{id:f.teacherAActiveSectionId},data:{dailyStartTime:new Date('1970-01-01T00:00:00Z'),dailyEndTime:new Date('1970-01-01T23:59:59Z')}});
await db.v81AccountSecurity.createMany({data:[f.adminUserId,f.teacherUserId].map(userId=>({userId,organizationId:f.organizationId,mustChangePassword:false,passwordChangedAt:new Date()}))});
await db.v81AdminAccess.create({data:{userId:f.adminUserId,organizationId:f.organizationId,kind:'SUPER',permissions:[],mustChangePassword:false}});
let logs='';const child=spawn(process.execPath,['dist/main.js'],{cwd:new URL('..',import.meta.url),env:{...foundationEnvironment(url,port),LOG_LEVEL:'error'},stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
const token=await new SignJWT({organizationId:f.organizationId,role:'STUDENT',sessionId:student.authSessionId,tokenVersion:0}).setProtectedHeader({alg:'EdDSA',typ:'JWT'}).setSubject(student.userId).setJti(randomUUID()).setIssuer('bnbu-sports-test').setAudience('bnbu-sports-test-clients').setIssuedAt().setExpirationTime('30m').sign(await importPKCS8(TEST_PRIVATE_KEY,'EdDSA'));
async function api(path,body,auth=token,method=body?'POST':'GET',key=randomUUID()) {const r=await fetch(base+path,{method,headers:{'content-type':'application/json','idempotency-key':key,...(auth?{authorization:'Bearer '+auth}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
const good={studentNumber:'2'+String(Date.now()).slice(-9),fullName:'陈小明',gender:'MALE',gradeYear:2023,collegeName:'FST',majorName:'CST',dateOfBirth:'2004-02-29',regionCode:'HK'};
const pass=name=>console.log(JSON.stringify({check:name,result:'PASS'}));
try {
 let ready=false;for(let i=0;i<150;i++){try{if((await fetch(base+'/health/live')).ok){ready=true;break;}}catch{} await new Promise(r=>setTimeout(r,100));}assert.ok(ready,logs);
 let me=await api('/me');assert.equal(me.status,200,JSON.stringify(me));assert.equal(me.body.data.studentProfile.profileQualityStatus,'REQUIRES_PROFILE_UPDATE');
 const old=await db.studentProfile.findUniqueOrThrow({where:{id:student.studentId}}), user=await db.user.findUniqueOrThrow({where:{id:student.userId}});
 for(const [path,body] of [['/exercise-sessions',{enrollmentId:student.enrollmentId,clientObservedAt:new Date().toISOString()}],['/exercise-records/'+randomUUID()+'/submit',{expectedVersion:1,mediaIds:[]}]] ) {const r=await api(path,body);assert.equal(r.status,422,JSON.stringify(r));assert.equal(r.body.code,'USER_PROFILE_INVALID',JSON.stringify(r));}
 pass('INVALID_PROFILE_BLOCKS_START_AND_SUBMIT');
 const invalid=await api('/me/student-profile',{...good,majorName:'bad',expectedVersion:old.version});assert.equal(invalid.status,422);assert.equal((await db.studentProfile.findUniqueOrThrow({where:{id:student.studentId}})).version,old.version);pass('INVALID_CORRECTION_PRESERVES_PROFILE');
 const teacher=(await api('/auth/password-login',{account:f.teacherEmail,password:TEST_PASSWORD},null)).body.data.accessToken;
 const adminResult=await api('/auth/password-login',{account:f.adminEmail,password:TEST_PASSWORD},null);assert.equal(adminResult.status,200,JSON.stringify(adminResult));const admin=adminResult.body.data.accessToken;
 assert.equal((await api('/students/'+student.studentId,{expectedVersion:old.version,profileUpdateReason:'test'},teacher,'PATCH')).status,403);pass('TEACHER_CANNOT_MARK');
 const key=randomUUID();const fixed=await api('/me/student-profile',{...good,expectedVersion:old.version},token,'POST',key);assert.equal(fixed.status,200,JSON.stringify(fixed));assert.equal(fixed.body.data.studentProfile.profileQualityStatus,'NORMAL');
 assert.equal((await api('/me/student-profile',{...good,expectedVersion:old.version},token,'POST',key)).status,200);
 const after=await db.user.findUniqueOrThrow({where:{id:student.userId}});assert.equal(after.primaryEmail,user.primaryEmail);assert.deepEqual(after.emailVerifiedAt,user.emailVerifiedAt);assert.equal(await db.enrollment.count({where:{studentId:student.studentId}}),1);
 const events=await db.$queryRaw`SELECT facts FROM v81_events WHERE resource_id=${student.studentId}::uuid AND event_type='PROFILE_QUALITY_CONFIRMED'`;assert.equal(events.length,1);assert.equal(events[0].facts.before.studentNumber,old.studentNumber);assert.equal(events[0].facts.after.studentNumber,good.studentNumber);pass('CORRECTION_IDEMPOTENT_AUDITED_EMAIL_ENROLLMENT_PRESERVED');
 const template=await api('/rule-templates',{displayName:'Profile quality test',expectedVersion:0},admin);assert.equal(template.status,201,JSON.stringify(template));
 const rules=await api('/class-sections/'+f.teacherAActiveSectionId+'/v81-rules',{templateId:template.body.data.id,minimumMinutes:30,weeklyLimit:3,courseTarget:600,generalTarget:600,regularDeadline:'2027-01-23T00:00:00Z',closingDeadline:'2027-01-30T00:00:00Z',settlementPlannedAt:'2027-01-30T01:00:00Z',publish:true,expectedVersion:0},teacher);assert.equal(rules.status,201,JSON.stringify(rules));
 const started=await api('/exercise-sessions',{enrollmentId:student.enrollmentId,clientObservedAt:new Date().toISOString()});assert.equal(started.status,201,JSON.stringify(started));pass('CORRECTION_RESTORES_REAL_SESSION_START');
 const v=fixed.body.data.studentProfile.version;
 const marked=await api('/students/'+student.studentId,{expectedVersion:v,profileUpdateReason:'请确认学号'},admin,'PATCH');assert.equal(marked.status,200,JSON.stringify(marked));assert.equal(marked.body.data.profileQualityStatus,'REQUIRES_PROFILE_UPDATE');
 const blocked=await api('/exercise-sessions',{enrollmentId:student.enrollmentId,clientObservedAt:new Date().toISOString()});assert.equal(blocked.body.code,'USER_PROFILE_INVALID',JSON.stringify(blocked));
 assert.equal((await api('/me/student-profile',{...good,expectedVersion:v})).status,409);pass('ADMIN_MARK_REBLOCKS_AND_STALE_VERSION_REJECTED');
 const completed=await api('/me/student-profile',{...good,expectedVersion:v+1});assert.equal(completed.status,200,JSON.stringify(completed));assert.equal(completed.body.data.studentProfile.profileQualityStatus,'NORMAL');
 const another=await seedExerciseSessionStudent(db,f,randomUUID().slice(0,5).toUpperCase(),'ACTIVE',false);await db.studentProfile.update({where:{id:another.studentId},data:{studentNumber:'2999999999'}});
 const conflict=await api('/me/student-profile',{...good,studentNumber:'2999999999',expectedVersion:v+2});assert.equal(conflict.status,409,JSON.stringify(conflict));assert.equal(conflict.body.code,'USER_IDENTITY_CONFLICT');pass('DUPLICATE_NUMBER_REJECTED_WITHOUT_ACCOUNT_MERGE');
 const listed=await api('/students',null,admin);assert.equal(listed.status,200);assert.ok(listed.body.data.some(p=>p.id===student.studentId && p.profileQualityStatus==='NORMAL'));pass('ADMIN_LIST_STATUS_AVAILABLE');
 if(process.env.QUALITY_KEEP_SERVER==='1') {await api('/students/'+student.studentId,{expectedVersion:v+2,profileUpdateReason:'浏览器补录测试'},admin,'PATCH');mkdirSync('../.local/profile-quality',{recursive:true});writeFileSync('../.local/profile-quality/browser.json',JSON.stringify({token,userId:student.userId,sessionId:student.authSessionId,good}));console.log('BROWSER_READY');await new Promise(r=>setTimeout(r,1200000));}
} finally {child.kill();await db.$disconnect();}
