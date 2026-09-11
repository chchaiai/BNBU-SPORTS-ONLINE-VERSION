import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
await loadRuntimeSecrets(process.env);
const config=validateEnvironment(process.env).RUNTIME_CONFIG;assert.equal(config.appEnvironment,'production');
const db=new PrismaService(config),data=JSON.parse(readFileSync('/acceptance/long-checkin.json','utf8')),mode=process.argv[2];
assert.ok(['open','close'].includes(mode));
try {
 const org=await db.organization.findUniqueOrThrow({where:{id:data.fixture.organizationId}});assert.ok(org.organizationCode.startsWith('BNBU-TEST-LONG-'));
 const user=await db.user.findUniqueOrThrow({where:{id:data.fixture.teacherUserId}});assert.equal(user.organizationId,org.id);assert.equal(user.role,'TEACHER');
 assert.equal(user.status,mode==='open'?'DISABLED':'ACTIVE');
 await db.user.update({where:{id:user.id},data:mode==='open'?{status:'ACTIVE'}:{status:'DISABLED',tokenVersion:{increment:1}}});
 console.log(JSON.stringify({check:'ISOLATED_PREVIEW_TEACHER',mode,result:'PASS'}));
} finally {await db.$disconnect();}
