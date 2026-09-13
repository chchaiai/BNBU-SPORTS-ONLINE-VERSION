// Production read-only inventory. No deletion, secret fields, or real-user rows.
import assert from 'node:assert/strict';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
await loadRuntimeSecrets(process.env);
const config=validateEnvironment(process.env).RUNTIME_CONFIG;
assert.equal(config.appEnvironment,'production');
const db=new PrismaService(config);
const organizationIds=['01a096c2-20a2-706b-8c69-802f67dee12c','01a09918-10d0-75ae-93a0-a4bf948d2495','01a09918-10d1-735e-878f-c4e38e791c8a','01a098da-7a63-72c8-8e68-8209f304250b'];
try {
 const facts=await db.$transaction(async tx=>{
  await tx.$executeRaw`SET TRANSACTION READ ONLY`;
  await tx.$executeRaw`SET LOCAL statement_timeout = '3s'`;
  const tables=await tx.$queryRaw`SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='organization_id' ORDER BY table_name`;
  const counts=[];
  for(const {table_name} of tables){
   assert.match(table_name,/^[a-z][a-z0-9_]*$/);
   const rows=await tx.$queryRawUnsafe(`SELECT organization_id, count(*)::int AS count FROM public."${table_name}" WHERE organization_id = ANY($1::uuid[]) GROUP BY organization_id`,organizationIds);
   if(rows.length) counts.push({table:table_name,rows});
  }
  const foreignKeys=await tx.$queryRaw`SELECT conrelid::regclass::text AS child,confrelid::regclass::text AS parent,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace ORDER BY conrelid::regclass::text,conname`;
  const objectColumns=await tx.$queryRaw`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND (column_name LIKE '%storage_key%' OR column_name LIKE '%object_key%') ORDER BY table_name,column_name`;
  const accountStatus=await tx.$queryRaw`SELECT organization_id,status,count(*)::int AS count FROM users WHERE organization_id=ANY(${organizationIds}::uuid[]) GROUP BY organization_id,status ORDER BY organization_id,status`;
  const objects=await tx.$queryRaw`
   SELECT organization_id,id::text AS resource_id,'media' AS kind,storage_key FROM media_evidence WHERE organization_id=ANY(${organizationIds}::uuid[])
   UNION ALL SELECT organization_id,id::text,'roster',source_file_storage_key FROM official_roster_imports WHERE organization_id=ANY(${organizationIds}::uuid[]) AND source_file_storage_key IS NOT NULL
   UNION ALL SELECT organization_id,id::text,'physical-import','v81/physical-imports/'||organization_id||'/'||id||'/'||source_sha256||CASE WHEN source_format='XLSX' THEN '.xlsx' ELSE '.csv' END FROM v81_physical_import_batches WHERE organization_id=ANY(${organizationIds}::uuid[])
   UNION ALL SELECT organization_id,id::text,'ocr',page->>'storageKey' FROM v81_ocr_batches CROSS JOIN LATERAL jsonb_array_elements(source_manifest) page WHERE organization_id=ANY(${organizationIds}::uuid[])`;
  return {scannedTables:tables.length,counts,foreignKeys,objectColumns,accountStatus,objects};
 },{timeout:30000});
 console.log(JSON.stringify({check:'SYNTHETIC_CLEANUP_INVENTORY',observedAt:new Date().toISOString(),organizationIds,...facts,scope:'Read-only known synthetic organizations and schema relations; no deletion; not a complete COS object inventory'}));
}finally{await db.$disconnect();}
