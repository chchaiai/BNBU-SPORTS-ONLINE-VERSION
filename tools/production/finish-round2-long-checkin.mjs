// Disable only the exact isolated fixture after the authorized cloud test.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
await loadRuntimeSecrets(process.env);
const config=validateEnvironment(process.env).RUNTIME_CONFIG;assert.equal(config.appEnvironment,'production');
const db=new PrismaService(config),data=JSON.parse(readFileSync('/acceptance/long-checkin.json','utf8'));
try{
 const ids=[data.fixture.organizationId,data.fixture.isolationOrganizationId];
 const organizations=await db.organization.findMany({where:{id:{in:ids}},select:{id:true,organizationCode:true}});assert.equal(organizations.length,2);
 const main=organizations.find(o=>o.id===ids[0]),other=organizations.find(o=>o.id===ids[1]);assert.ok(main.organizationCode.startsWith('BNBU-TEST-LONG-'));assert.equal(other.organizationCode,main.organizationCode.replace('BNBU-TEST-','ISOLATION-TEST-'));
 const student=await db.user.findUniqueOrThrow({where:{id:data.student.userId}});assert.equal(student.organizationId,main.id);assert.equal(student.role,'STUDENT');
 const refreshGenerations=await db.refreshToken.count({where:{authSessionId:data.longRunSessionId??data.studentSession.sessionId,organizationId:main.id}});assert.ok(refreshGenerations>=2,'The real long-running session must rotate its expired access credentials');
 const result=await db.$transaction(async tx=>{const before=await tx.exerciseRecord.count({where:{organizationId:main.id}});const disabled=await tx.user.updateMany({where:{organizationId:{in:ids},status:{not:'DISABLED'}},data:{status:'DISABLED',tokenVersion:{increment:1}}});const after=await tx.exerciseRecord.count({where:{organizationId:main.id}});assert.equal(after,before);return{disabledAccounts:disabled.count,recordsRetained:after};});
 console.log(JSON.stringify({check:'LONG_CLOUD_FIXTURE_ACCESS_REVOKED',result:'PASS',organizationId:main.id,refreshGenerations,...result}));
}finally{await db.$disconnect();}
