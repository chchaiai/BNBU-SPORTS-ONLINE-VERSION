import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
await loadRuntimeSecrets(process.env);
const config=validateEnvironment(process.env).RUNTIME_CONFIG;
assert.equal(config.appEnvironment,'production');
assert.equal(config.publicOrganizationCode,'BNBU');
const db=new PrismaService(config),after=process.argv.includes('--after');
try {
 const result=await db.$transaction(async tx=>{
  await tx.$executeRaw`SET TRANSACTION READ ONLY`;
  const migrations=await tx.$queryRaw`SELECT migration_name,checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
  const [fn]=await tx.$queryRaw`SELECT pg_get_functiondef('erase_v81_student(uuid,uuid,uuid)'::regprocedure) AS definition`;
  const policies=await tx.$queryRaw`SELECT platform,minimum_supported_build_number,latest_build_number,enforcement FROM app_release_policies WHERE platform='IOS' AND effective_at<=now() AND (expires_at IS NULL OR expires_at>now())`;
  const [attachments]=await tx.$queryRaw`SELECT count(*)::int AS total,count(*) FILTER(WHERE feedback_id IS NOT NULL)::int AS bound FROM feedback_attachments`;
  if(after){
    assert.ok(migrations.some(m=>m.migration_name==='0091_feedback_erasure_cleanup'));
    assert.ok(fn.definition.includes("'feedback_attachments'"));
    assert.ok(fn.definition.includes("c.status='CONSUMED'"));
    assert.ok(fn.definition.includes("k.kind='upload_key'"));
    await tx.$queryRaw`SELECT count(*) FROM feedback_object_cleanup`;
  }
  return {result:'PASS',phase:after?'AFTER':'BEFORE',migrations,erasureDefinitionSha256:createHash('sha256').update(fn.definition).digest('hex'),attachmentCounts:attachments,iosPolicies:policies,productionBusinessWrites:0};
 });console.log(JSON.stringify(result));
}finally{await db.$disconnect();}
