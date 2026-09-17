import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
await loadRuntimeSecrets(process.env);const config=validateEnvironment(process.env).RUNTIME_CONFIG;
assert.equal(config.appEnvironment,'production');assert.equal(new URL(config.databaseUrl).hostname,'172.19.0.16');
const db=new PrismaService(config),f=JSON.parse(readFileSync('/acceptance/demand-20260916.json','utf8'));
try{
 const org=await db.organization.findUniqueOrThrow({where:{id:f.fixture.organizationId}});assert.match(org.organizationCode,/^BNBU-TEST-DEMAND16-/);
 const main=await db.organization.findUniqueOrThrow({where:{organizationCode:'BNBU'}});
 const policy=await db.systemPolicy.findUniqueOrThrow({where:{organizationId:org.id}}),mainPolicy=await db.systemPolicy.findUniqueOrThrow({where:{organizationId:main.id}});assert.equal(mainPolicy.systemMode,'NORMAL');
 const migrations=await db.$queryRaw`SELECT migration_name,checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
 assert.equal(migrations.length,82);assert.equal(migrations.at(-1).migration_name,'0082_exercise_date_boundaries');
 let disabled=0;
 if(process.argv.includes('--cleanup')){
  assert.equal(policy.systemMode,'NORMAL');
  const isolated=await db.organization.findUniqueOrThrow({where:{id:f.fixture.isolationOrganizationId}});assert.match(isolated.organizationCode,/^ISOLATION-TEST-DEMAND16-/);
  disabled=(await db.user.updateMany({where:{organizationId:{in:[org.id,isolated.id]},status:'ACTIVE'},data:{status:'DISABLED',tokenVersion:{increment:1}}})).count;
 }
 console.log(JSON.stringify({result:'PASS',migrationCount:migrations.length,lastMigrations:migrations.slice(-2),formalOrganizationMode:mainPolicy.systemMode,syntheticOrganizationMode:policy.systemMode,syntheticUsersDisabled:disabled,cleanup:process.argv.includes('--cleanup')}));
}finally{await db.$disconnect();}
