import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '/app/dist/generated/prisma/client.js';
import { createPrismaPgConfiguration } from '/app/dist/common/database/postgres-tls.js';
const secret=JSON.parse(fs.readFileSync('/run/secrets/runtime.json','utf8'));
const cfg=createPrismaPgConfiguration(secret.DATABASE_URL,'/run/secrets/tencentdb-ca-chain.pem');
const db=new PrismaClient({adapter:new PrismaPg({...cfg.pool,max:1,options:'-c statement_timeout=5000 -c lock_timeout=1000'},{schema:cfg.schema}),log:[]});
try {
 const definitions=await db.$queryRaw`SELECT proname, pg_get_functiondef(oid) AS definition FROM pg_proc WHERE proname IN ('guard_v81_rule_template','guard_v81_runtime_archive','erase_v81_student') AND pronamespace='public'::regnamespace`;
 assert.equal(definitions.length,3);
 for(const row of definitions)assert.ok(row.definition.includes("system_mode IN ('NORMAL','MAINTENANCE')"));
 const migrations=await db.$queryRaw`SELECT migration_name,checksum FROM _prisma_migrations WHERE migration_name='0078_admin_maintenance_access' AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
 assert.equal(migrations.length,1);assert.equal(migrations[0].checksum,'92a9a0eb41c61814facb64ac295cdf3a380e4d486f8a71a363a5b2808c88b2af');
 console.log(JSON.stringify({result:'PASS',functions:definitions.map(x=>x.proname),migration:migrations[0],readOnly:true}));
} finally {await db.$disconnect()}
