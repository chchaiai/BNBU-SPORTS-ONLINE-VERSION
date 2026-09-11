// Explicitly authorized isolated cloud acceptance fixture. No existing school
// account is changed. Session bootstrap is test setup, not SMTP acceptance.
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
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

try {
 const prior=JSON.parse(readFileSync('/acceptance/long-checkin.json','utf8'));
 const fixture=prior.fixture;
 const org=await db.organization.findUniqueOrThrow({where:{id:fixture.organizationId}});
 assert.ok(org.organizationCode.startsWith('BNBU-TEST-LONG-'));
 const student=await seedExerciseSessionStudent(db,fixture,'CONT'+Date.now().toString(36).toUpperCase(),'ACTIVE',false);
 const clock={now:()=>new Date()},ids={next:uuidv7},issuer=new TokenService(config,clock,ids),digest=new SecureDigestService(config);
 const auth=new AuthService(db,null,issuer,null,null,new AuditService(clock,ids,digest),new OutboxService(db,clock,ids),digest,clock,ids,config);
 const studentSession=await db.$transaction(async tx=>auth.establishStudentSession(tx,await tx.user.findUniqueOrThrow({where:{id:student.userId}}),{requestId:uuidv7(),idempotencyKey:randomUUID()}));
 writeFileSync('/acceptance/continuity.json',JSON.stringify({fixture,student,studentSession,teacher:prior.teacher}),{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({check:'ISOLATED_CONTINUITY_STUDENT_READY',result:'PASS',studentId:student.studentId,organizationId:fixture.organizationId}));
}finally{await db.$disconnect();}
