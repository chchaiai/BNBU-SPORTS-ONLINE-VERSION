// Explicitly authorized isolated cloud acceptance fixture. No existing school
// account is changed. Session bootstrap is test setup, not SMTP acceptance.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {hash,argon2id} from 'argon2';
import {v7 as uuidv7} from 'uuid';
import {seedFoundationFixture,seedExerciseSessionStudent} from '/app/production-smoke-helpers.mjs';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
import {TokenService} from '/app/dist/modules/auth/token.service.js';
import {AuthService} from '/app/dist/modules/auth/auth.service.js';
import {SecureDigestService} from '/app/dist/common/security/secure-digest.service.js';
import {AuditService} from '/app/dist/common/audit/audit.service.js';
import {OutboxService} from '/app/dist/common/outbox/outbox.service.js';
await loadRuntimeSecrets(process.env);
const config=validateEnvironment(process.env).RUNTIME_CONFIG,db=new PrismaService(config);
assert.equal(config.appEnvironment,'production');
let fixture;
try{
 const suffix=Date.now().toString(36).toUpperCase();
 fixture=await seedFoundationFixture(db,'-BUG12-'+suffix);
 const student=await seedExerciseSessionStudent(db,fixture,'L'+suffix);
 await db.classSection.update({where:{id:fixture.teacherAActiveSectionId},data:{checkInEndDate:new Date('2027-01-23T00:00:00Z'),dailyStartTime:new Date('1970-01-01T00:00:00Z'),dailyEndTime:new Date('1970-01-01T23:59:59Z')}});
 const password=randomBytes(32).toString('base64url');
 await db.user.update({where:{id:fixture.teacherUserId},data:{passwordHash:await hash(password,{type:argon2id})}});
 await db.v81AccountSecurity.createMany({data:[fixture.adminUserId,fixture.teacherUserId].map(userId=>({userId,organizationId:fixture.organizationId,mustChangePassword:false,passwordChangedAt:new Date()}))});
 await db.v81AdminAccess.create({data:{userId:fixture.adminUserId,organizationId:fixture.organizationId,kind:'SUPER',permissions:[],mustChangePassword:false}});
 const clock={now:()=>new Date()},ids={next:uuidv7},issuer=new TokenService(config,clock,ids),digest=new SecureDigestService(config);
 const auth=new AuthService(db,null,issuer,null,null,new AuditService(clock,ids,digest),new OutboxService(db,clock,ids),digest,clock,ids,config);
 const studentSession=await db.$transaction(async tx=>auth.establishStudentSession(tx,await tx.user.findUniqueOrThrow({where:{id:student.userId}}),{requestId:uuidv7(),idempotencyKey:randomUUID()}));
 async function issue(userId,role){const now=new Date(),sessionId=uuidv7();await db.authSession.create({data:{id:sessionId,organizationId:fixture.organizationId,userId,status:'ACTIVE',tokenFamilyId:uuidv7(),createdAt:now,lastSeenAt:now,absoluteExpiresAt:new Date(+now+3600000),idleExpiresAt:new Date(+now+3600000)}});return(await issuer.issue({userId,organizationId:fixture.organizationId,role,sessionId,tokenVersion:0})).token;}
 const admin=await issue(fixture.adminUserId,'ADMIN'),teacher=await issue(fixture.teacherUserId,'TEACHER');
 async function request(token,path,body){const r=await fetch('https://www.student.bnbusports.cn/api/v1'+path,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify(body)});const value=await r.json();assert.ok(r.ok,JSON.stringify({path,status:r.status,code:value.code}));return value.data;}
 const template=await request(admin,'/rule-templates',{displayName:'Bug 20260912 cloud acceptance',expectedVersion:0});
 await request(teacher,`/class-sections/${fixture.teacherAActiveSectionId}/v81-rules`,{templateId:template.id,minimumMinutes:1,weeklyLimit:3,courseTarget:600,generalTarget:600,regularDeadline:'2027-01-23T00:00:00Z',closingDeadline:'2027-01-30T00:00:00Z',settlementPlannedAt:'2027-01-30T01:00:00Z',publish:true,expectedVersion:0});
 const teacherUser=await db.user.findUniqueOrThrow({where:{id:fixture.teacherUserId}});
 writeFileSync('/acceptance/bug-20260912.json',JSON.stringify({fixture,student,studentSession,teacherToken:teacher,adminToken:admin,teacher:{email:teacherUser.primaryEmail,password},createdAt:new Date().toISOString()}),{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({check:'BUG_CLOUD_FIXTURE_READY',result:'PASS',organizationId:fixture.organizationId,classSectionId:fixture.teacherAActiveSectionId,studentId:student.studentId,teacherId:fixture.teacherUserId,sessionSetup:'isolated synthetic fixture; SMTP not tested'}));
}catch(error){if(fixture)await db.user.updateMany({where:{organizationId:{in:[fixture.organizationId,fixture.isolationOrganizationId]}},data:{status:'DISABLED',tokenVersion:{increment:1}}});throw error;}finally{await db.$disconnect();}
