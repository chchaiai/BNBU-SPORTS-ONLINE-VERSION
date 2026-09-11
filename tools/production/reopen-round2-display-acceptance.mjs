// Reopen only the two isolated test accounts for a read-only display retest.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {v7 as uuidv7} from 'uuid';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
import {TokenService} from '/app/dist/modules/auth/token.service.js';
import {AuthService} from '/app/dist/modules/auth/auth.service.js';
import {SecureDigestService} from '/app/dist/common/security/secure-digest.service.js';
import {AuditService} from '/app/dist/common/audit/audit.service.js';
import {OutboxService} from '/app/dist/common/outbox/outbox.service.js';
await loadRuntimeSecrets(process.env);
const config=validateEnvironment(process.env).RUNTIME_CONFIG;assert.equal(config.appEnvironment,'production');
const db=new PrismaService(config),path='/acceptance/long-checkin.json',data=JSON.parse(readFileSync(path,'utf8'));
try{
 const org=await db.organization.findUniqueOrThrow({where:{id:data.fixture.organizationId}});assert.ok(org.organizationCode.startsWith('BNBU-TEST-LONG-'));
 const users=await db.user.findMany({where:{id:{in:[data.student.userId,data.fixture.teacherUserId]},organizationId:org.id}});assert.equal(users.length,2);assert.deepEqual(users.map(u=>u.role).sort(),['STUDENT','TEACHER']);assert.ok(users.every(u=>u.status==='DISABLED'));
 const clock={now:()=>new Date()},ids={next:uuidv7},issuer=new TokenService(config,clock,ids),digest=new SecureDigestService(config);
 const auth=new AuthService(db,null,issuer,null,null,new AuditService(clock,ids,digest),new OutboxService(db,clock,ids),digest,clock,ids,config);
 data.longRunSessionId=data.longRunSessionId??data.studentSession.sessionId;
 data.studentSession=await db.$transaction(async tx=>{await tx.user.updateMany({where:{id:{in:users.map(u=>u.id)},organizationId:org.id,status:'DISABLED'},data:{status:'ACTIVE'}});return auth.establishStudentSession(tx,await tx.user.findUniqueOrThrow({where:{id:data.student.userId}}),{requestId:uuidv7(),idempotencyKey:randomUUID()});});
 writeFileSync(path,JSON.stringify(data),{mode:0o600});console.log(JSON.stringify({check:'ISOLATED_DISPLAY_RETEST_ACCOUNTS_READY',result:'PASS',accountCount:2}));
}finally{await db.$disconnect();}
