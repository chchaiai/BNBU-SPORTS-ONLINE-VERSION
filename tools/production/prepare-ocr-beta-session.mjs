// Bootstrap a short-lived session for the already-existing synthetic TEST BETA.
// This is fixture setup and does not constitute email authentication acceptance.
import assert from 'node:assert/strict';import {writeFileSync,existsSync} from 'node:fs';import {randomUUID} from 'node:crypto';import {v7 as uuidv7} from 'uuid';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
import {TokenService} from '/app/dist/modules/auth/token.service.js';
import {AuthService} from '/app/dist/modules/auth/auth.service.js';
import {SecureDigestService} from '/app/dist/common/security/secure-digest.service.js';
import {AuditService} from '/app/dist/common/audit/audit.service.js';
import {OutboxService} from '/app/dist/common/outbox/outbox.service.js';
await loadRuntimeSecrets(process.env);const config=validateEnvironment(process.env).RUNTIME_CONFIG,db=new PrismaService(config);
const organizationId='01a096c2-20a2-706b-8c69-802f67dee12c',path='/tmp/ocr-beta-session-20260913.json';assert.ok(!existsSync(path));
try{const student=await db.studentProfile.findFirstOrThrow({where:{organizationId,studentNumber:'9900000002'}});assert.equal(student.fullName,'TEST BETA');
 const clock={now:()=>new Date()},ids={next:uuidv7},issuer=new TokenService(config,clock,ids),digest=new SecureDigestService(config);
 const auth=new AuthService(db,null,issuer,null,null,new AuditService(clock,ids,digest),new OutboxService(db,clock,ids),digest,clock,ids,config);
 const session=await db.$transaction(async tx=>auth.establishStudentSession(tx,await tx.user.findUniqueOrThrow({where:{id:student.userId}}),{requestId:uuidv7(),idempotencyKey:randomUUID()}));
 writeFileSync(path,JSON.stringify({studentId:student.id,userId:student.userId,organizationId,session}),{flag:'wx',mode:0o600});console.log(JSON.stringify({check:'EXISTING_SYNTHETIC_BETA_SESSION_READY',status:'PASS',organizationId,studentId:student.id}));
}finally{await db.$disconnect();}
