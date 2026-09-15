import 'reflect-metadata';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHmac,randomUUID} from 'node:crypto';
import {v7 as uuidv7} from 'uuid';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
import {AuthCodeCrypto} from '/app/dist/modules/client-capabilities/auth-code.crypto.js';
await loadRuntimeSecrets(process.env);const config=validateEnvironment(process.env).RUNTIME_CONFIG,db=new PrismaService(config);
assert.equal(config.appEnvironment,'production');
const state=JSON.parse(readFileSync('/acceptance/bug-20260915.json','utf8')),f=state.fixture,checks=[];
async function call(check,path,token,body,expected=200,key=randomUUID(),extra={}){
 const r=await fetch('https://www.student.bnbusports.cn/api/v1'+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json','idempotency-key':key,...(token?{authorization:`Bearer ${token}`} :{}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const v=await r.json();checks.push({check,status:r.status,code:v.code,requestId:v.meta?.requestId??v.requestId});assert.equal(r.status,expected,JSON.stringify(checks.at(-1)));return v.data;
}
try{
 assert.equal((await db.organization.findUniqueOrThrow({where:{id:f.organizationId}})).organizationCode.includes('BUG15'),true);
 const teacherLogin=await call('TEACHER_PASSWORD_LOGIN','/auth/password-login',null,{account:state.accounts.teacher.email,password:state.accounts.teacher.password});state.teacherToken=teacherLogin.accessToken;
 state.studentSession=await call('STUDENT_SESSION_REFRESH','/auth/refresh',null,{refreshToken:state.studentSession.refreshToken});
 writeFileSync('/acceptance/bug-20260915.json',JSON.stringify(state),{mode:0o600});
 const path=`/class-sections/${f.teacherAActiveSectionId}/course-invites`;
 await call('INVITE_ZERO_REJECTED',path,state.teacherToken,{expiresInMinutes:0},422);
 await call('INVITE_PAST_SEMESTER_REJECTED',path,state.teacherToken,{expiresInMinutes:9999999},422);
 const one=await call('INVITE_ONE_MINUTE',path,state.teacherToken,{expiresInMinutes:1},201);
 const row=await db.courseInvite.findUniqueOrThrow({where:{id:one.inviteToken.split('.')[0]}});assert.equal(row.expiresAt-row.createdAt,60000);
 const invite=await call('INVITE_COMBINED_1563',path,state.teacherToken,{expiresInMinutes:1563},201);
 const row2=await db.courseInvite.findUniqueOrThrow({where:{id:invite.inviteToken.split('.')[0]}});assert.equal(row2.expiresAt-row2.createdAt,1563*60000);
 const before=await db.studentProfile.findUniqueOrThrow({where:{id:state.student.studentId}});
 const token=state.studentSession.accessToken;assert.ok(token);assert.ok(!/^2[0-9]{9}$/.test(before.studentNumber));
 const profile={collegeName:'GS',majorName:'invalid',dateOfBirth:'2004-02-29',regionCode:'HK',expectedVersion:before.version};
 await call('PROFILE_LOWERCASE_REJECTED','/me/student-profile',token,profile,422);
 const key=randomUUID();profile.majorName='CUSTOM';await call('LEGACY_PROFILE_EDIT','/me/student-profile',token,profile,200,key);await call('PROFILE_REPLAY','/me/student-profile',token,profile,200,key);
 const after=await db.studentProfile.findUniqueOrThrow({where:{id:before.id}});assert.equal(after.studentNumber,before.studentNumber);assert.equal(after.version,before.version+1);assert.equal(after.majorName,'CUSTOM');
 let version=after.version;
 for(const change of [{collegeName:'OTHER',majorName:'CST'},{collegeName:'FST',majorName:'ACCT'},{collegeName:'GS',majorName:'M1'}])await call('PROFILE_BAD_'+change.collegeName+'_'+change.majorName,'/me/student-profile',token,{...profile,...change,expectedVersion:version},422);
 for(const change of [{collegeName:'SAI',majorName:'ACCT'},{collegeName:'SAI',majorName:'CST'},{collegeName:'SGE',majorName:'CUSTOM'},{collegeName:'GS',majorName:'CUSTOM'}]){await call('PROFILE_ACADEMIC_'+change.collegeName+'_'+change.majorName,'/me/student-profile',token,{...profile,...change,expectedVersion:version});version++;}
 checks.push({check:'PERSISTED_LEGACY_ID_AND_INVITE_TIMING',result:'PASS'});
 const number='2'+String(Date.now()).slice(-9),email=number+'@mail.bnbu.edu.cn',id=uuidv7(),now=new Date(),code='284613';
 const derive=purpose=>createHmac('sha256',config.securityHashKey).update(`auth-code:${purpose}:v1`).digest();const crypto=new AuthCodeCrypto({digestKey:derive('digest'),escrowKey:derive('escrow'),escrowKeyVersion:1});
 await db.studentSignInChallenge.create({data:{id,organizationId:f.organizationId,userId:null,channel:'EMAIL',locale:'zh-CN',accountDigest:createHmac('sha256',config.securityHashKey).update('auth-code-account\0EMAIL\0'+email).digest('hex'),codeDigest:crypto.digestCode(`STUDENT_SIGN_IN:${id}`,code),codeKeyVersion:1,status:'ACTIVE',failedAttempts:0,maxAttempts:5,requestedAt:now,deliveredAt:now,expiresAt:new Date(+now+600000),requestId:uuidv7()}});
 const verified=await call('SYNTHETIC_EMAIL_PROOF_VERIFY','/auth/student-sign-in-codes/verify',null,{challengeId:id,code,deviceId:'bug15-cloud-synthetic',joinEmail:email,joinInviteToken:invite.inviteToken});
 const input={fullName:'Synthetic Bug15 Student',studentNumber:number,gender:'MALE',gradeYear:2026,collegeName:'FST',majorName:'CST',dateOfBirth:'2005-01-01',regionCode:'CN-44',joinEmailProof:verified.joinEmailProof};
 const capPath=`/course-invites/${encodeURIComponent(invite.inviteToken)}/join-capabilities`;
 for(const [check,change] of [['BAD_ID',{studentNumber:'12345'}],['BAD_COLLEGE',{collegeName:'OTHER'}],['BAD_PAIR',{majorName:'ACCT'}],['LOWER_CUSTOM',{collegeName:'GS',majorName:'custom'}]])await call(check,capPath,null,{...input,...change},422);
 for(const change of [{collegeName:'SAI',majorName:'ACCT'},{collegeName:'SAI',majorName:'CST'},{collegeName:'SGE',majorName:'CUSTOM'},{collegeName:'GS',majorName:'CUSTOM'}])await call('ACADEMIC_ACCEPT_'+change.collegeName+'_'+change.majorName,capPath,null,{...input,...change},201);
 const capability=await call('FINAL_JOIN_CAPABILITY',capPath,null,input,201);
 const joined=await call('JOIN_REAL_HTTP',`/course-invites/${encodeURIComponent(invite.inviteToken)}/join`,null,{},201,randomUUID(),{'x-join-capability':capability.joinCapability});
 assert.equal(joined.enrollment.status,'ACTIVE');
 checks.push({check:'PERSISTED_LEGACY_ID_AND_INVITE_TIMING',result:'PASS'});
 writeFileSync('/acceptance/bug15-http-result.json',JSON.stringify({result:'PASS',organizationId:f.organizationId,checks,scope:'Real cloud HTTP and PostgreSQL; synthetic email challenge bootstrap, no SMTP delivery claim'},null,2));console.log(JSON.stringify({result:'PASS',checks}));
}catch(error){writeFileSync('/acceptance/bug15-http-result.json',JSON.stringify({result:'PARTIAL',checks,scope:'Synthetic cloud fixtures; remaining checks blocked at recorded last response'},null,2));console.error(JSON.stringify({result:'FAIL',errorType:error.name,assertion:error.name==='AssertionError'?error.message:undefined,lastCheck:checks.at(-1)}));process.exitCode=1;}finally{await db.$disconnect();}
