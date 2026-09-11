// Disable only the isolated course-closure acceptance accounts, retaining evidence.
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';import {validateEnvironment} from '/app/dist/common/config/environment.js';import {PrismaService} from '/app/dist/common/database/prisma.service.js';
await loadRuntimeSecrets(process.env);const config=validateEnvironment(process.env).RUNTIME_CONFIG,db=new PrismaService(config);assert.equal(config.appEnvironment,'production');
try{const state=JSON.parse(readFileSync('/acceptance/closure-checkin.json','utf8')),orgs=[state.fixture.organizationId,state.fixture.isolationOrganizationId];
 for(const id of orgs){const org=await db.organization.findUniqueOrThrow({where:{id}});assert.ok(org.organizationCode.includes('-CLOSE-'));}
 if(process.argv[2]==='--reopen-teacher'){const user=await db.user.findUniqueOrThrow({where:{id:state.fixture.teacherUserId}});assert.equal(user.status,'DISABLED');assert.equal(user.organizationId,state.fixture.organizationId);await db.user.update({where:{id:user.id},data:{status:'ACTIVE'}});console.log(JSON.stringify({check:'CLOSURE_TEACHER_REOPENED',result:'PASS'}));}else{
 const before=await db.exerciseRecord.count({where:{organizationId:{in:orgs}}});
 const disabled=await db.user.updateMany({where:{organizationId:{in:orgs},status:'ACTIVE'},data:{status:'DISABLED',tokenVersion:{increment:1}}});
 assert.equal(await db.user.count({where:{organizationId:{in:orgs},status:'ACTIVE'}}),0);assert.equal(await db.exerciseRecord.count({where:{organizationId:{in:orgs}}}),before);
 console.log(JSON.stringify({check:'CLOSURE_FIXTURE_DISABLED',result:'PASS',disabled:disabled.count,recordsRetained:before}));}
}finally{await db.$disconnect();}
