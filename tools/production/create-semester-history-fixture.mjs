import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {existsSync,writeFileSync} from 'node:fs';
import {seedFoundationFixture} from '/app/semester-create-only.mjs';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
const destination='/acceptance/semester-history-fixture.json';
assert.ok(!existsSync(destination),'Existing fixture must be resumed');
await loadRuntimeSecrets(process.env);
const config=validateEnvironment(process.env).RUNTIME_CONFIG;
assert.equal(config.appEnvironment,'production');
const db=new PrismaService(config);
const namespace='-SH-'+Date.now().toString(36).toUpperCase(),password=randomBytes(36).toString('base64url');
try {
 const fixture=await db.$transaction(async tx=>{
  assert.equal(await tx.organization.count({where:{organizationCode:{in:['BNBU-TEST'+namespace,'ISOLATION-TEST'+namespace]}}}),0);
  const created=await seedFoundationFixture({$transaction:fn=>fn(tx)},namespace,password);
  const organizations=[created.organizationId,created.isolationOrganizationId];
  const users=await tx.user.findMany({where:{organizationId:{in:organizations}},select:{id:true}});
  assert.equal(users.length,4);
  await tx.user.updateMany({where:{id:{in:users.map(u=>u.id)},organizationId:{in:organizations}},data:{status:'DISABLED',tokenVersion:{increment:1}}});
  assert.equal(await tx.user.count({where:{organizationId:{in:organizations},status:'ACTIVE'}}),0);
  return {...created,namespace,userIds:users.map(u=>u.id)};
 },{timeout:30000});
 writeFileSync(destination,JSON.stringify({fixture,createdAt:new Date().toISOString(),status:'BASELINE_ONLY_ALL_USERS_DISABLED',scope:'New isolated synthetic organizations; no existing courses changed, no authenticated sessions created'},null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({result:'PASS',organizationId:fixture.organizationId,isolationOrganizationId:fixture.isolationOrganizationId,usersDisabled:fixture.userIds.length,scope:'Fixture baseline only; semester history acceptance not executed'}));
} finally {await db.$disconnect();}
