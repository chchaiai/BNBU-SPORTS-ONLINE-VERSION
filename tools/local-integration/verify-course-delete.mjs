// Reopen only the two isolated test accounts for a read-only display retest.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const {v7:uuidv7}=createRequire((process.env.BNBU_CASCADE_CLOUD==='1'?'/app':'/workspace/backend')+'/package.json')('uuid');
const {loadRuntimeSecrets}=await import((process.env.BNBU_CASCADE_CLOUD==='1'?'/app':'/workspace/backend')+'/dist/common/config/file-json-secret-loader.js');
const {validateEnvironment}=await import((process.env.BNBU_CASCADE_CLOUD==='1'?'/app':'/workspace/backend')+'/dist/common/config/environment.js');
const {PrismaService}=await import((process.env.BNBU_CASCADE_CLOUD==='1'?'/app':'/workspace/backend')+'/dist/common/database/prisma.service.js');
const {TokenService}=await import((process.env.BNBU_CASCADE_CLOUD==='1'?'/app':'/workspace/backend')+'/dist/modules/auth/token.service.js');
const {AuthService}=await import((process.env.BNBU_CASCADE_CLOUD==='1'?'/app':'/workspace/backend')+'/dist/modules/auth/auth.service.js');
const {SecureDigestService}=await import((process.env.BNBU_CASCADE_CLOUD==='1'?'/app':'/workspace/backend')+'/dist/common/security/secure-digest.service.js');
const {AuditService}=await import((process.env.BNBU_CASCADE_CLOUD==='1'?'/app':'/workspace/backend')+'/dist/common/audit/audit.service.js');
const {OutboxService}=await import((process.env.BNBU_CASCADE_CLOUD==='1'?'/app':'/workspace/backend')+'/dist/common/outbox/outbox.service.js');
const cloud=process.env.BNBU_CASCADE_CLOUD==='1';
let config;
if(cloud){await loadRuntimeSecrets(process.env);config=validateEnvironment(process.env).RUNTIME_CONFIG;assert.equal(config.appEnvironment,'production');}
else{const {foundationEnvironment}=await import('/workspace/backend/test/helpers/test-environment.ts');const state=JSON.parse(readFileSync('/workspace/.browser-state/state.json','utf8'));const url=new URL('postgresql://sql-postgres:5432/v81_browser_test');url.username=process.env.PGUSER;url.password=process.env.PGPASSWORD;config=validateEnvironment({...foundationEnvironment(url.href,3199),...state.secrets,ACCESS_TOKEN_TTL:"900",REFRESH_TOKEN_ABSOLUTE_TTL:"86400",REFRESH_TOKEN_IDLE_TTL:"7200"}).RUNTIME_CONFIG;}
const db=new PrismaService(config),path=(cloud?'/acceptance':'/workspace/.browser-state')+'/course-delete-private.json',data=JSON.parse(readFileSync(path,'utf8'));
try{
 const org=await db.organization.findUniqueOrThrow({where:{id:data.fixture.organizationId}});assert.ok(org.organizationCode.includes('CDELETE'));
 assert.equal(await db.classSection.count({where:{id:data.fixture.teacherAActiveSectionId}}),0);
 assert.equal(await db.exerciseRecord.count({where:{id:data.record.recordId}}),0);
 assert.equal(await db.user.count({where:{id:data.record.studentUserId,status:'ACTIVE',emailVerifiedAt:{not:null}}}),1);
 assert.equal(await db.enrollment.count({where:{studentId:data.students[0].studentId,classSectionId:data.fixture.teacherBArchivedSectionId}}),1);
 const clock={now:()=>new Date()},ids={next:uuidv7},issuer=new TokenService(config,clock,ids),digest=new SecureDigestService(config);
 const auth=new AuthService(db,null,issuer,null,null,new AuditService(clock,ids,digest),new OutboxService(db,clock,ids),digest,clock,ids,config);

 data.studentSession=await db.$transaction(async tx=>{return auth.establishStudentSession(tx,await tx.user.findUniqueOrThrow({where:{id:data.record.studentUserId}}),{requestId:uuidv7(),idempotencyKey:randomUUID()});});

 writeFileSync(path,JSON.stringify(data),{mode:0o600});console.log(JSON.stringify({check:'COURSE_DELETE_DATABASE',result:'PASS',studentEmailRetained:true,otherMembershipRetained:true}));
}finally{await db.$disconnect();}
