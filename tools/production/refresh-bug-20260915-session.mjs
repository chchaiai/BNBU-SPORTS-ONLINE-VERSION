import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
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

const state=JSON.parse(readFileSync('/acceptance/bug-20260915.json','utf8'));
try{
 assert.equal(state.fixture.organizationId,'01a0a0ef-2a54-71ce-ac8c-f05bb95d0db8');
 const user=await db.user.findUniqueOrThrow({where:{id:state.student.userId}});assert.equal(user.organizationId,state.fixture.organizationId);
 const clock={now:()=>new Date()},ids={next:uuidv7},issuer=new TokenService(config,clock,ids),digest=new SecureDigestService(config);
 const auth=new AuthService(db,null,issuer,null,null,new AuditService(clock,ids,digest),new OutboxService(db,clock,ids),digest,clock,ids,config);
 state.studentSession=await db.$transaction(tx=>auth.establishStudentSession(tx,user,{requestId:uuidv7(),idempotencyKey:randomUUID()}));
 // Fixture-only incomplete field exposes the existing profile completion flow.
 await db.studentProfile.update({where:{id:state.student.studentId},data:{collegeName:null}});
 writeFileSync('/acceptance/bug-20260915.json',JSON.stringify(state),{mode:0o600});
 console.log(JSON.stringify({result:'PASS',check:'SYNTHETIC_STUDENT_PAGE_FIXTURE_READY'}));
}finally{await db.$disconnect();}
