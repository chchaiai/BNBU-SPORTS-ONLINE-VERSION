import pg from '../../backend/node_modules/pg/lib/index.js';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

export async function resolveFailedSettlementProbeMigration(databaseUrl,environment){
  const url=new URL(databaseUrl);
  assert.equal(url.hostname,'sql-postgres');assert.equal(url.pathname,'/v81_runtime_test');
  const client=new pg.Client({connectionString:databaseUrl});await client.connect();
  try {
    const state=(await client.query("SELECT current_database() AS database,to_regclass('public.v81_settlement_report_revisions') AS relation,to_regprocedure('guard_v81_settlement_report_revision()') AS guard")).rows[0];
    assert.equal(state.database,'v81_runtime_test');assert.equal(state.relation,null);assert.equal(state.guard,null);
    const failed=(await client.query("SELECT finished_at,rolled_back_at,applied_steps_count FROM _prisma_migrations WHERE migration_name='0056_v81_settlement_reports' AND rolled_back_at IS NULL")).rows;
    assert.equal(failed.length,1);assert.equal(failed[0].finished_at,null);assert.equal(failed[0].applied_steps_count,0);
  }finally{await client.end();}
  const child=spawn(process.execPath,['node_modules/prisma/build/index.js','migrate','resolve','--rolled-back','0056_v81_settlement_reports'],{env:environment,stdio:['ignore','pipe','pipe']});
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>process.stdout.write(chunk.toString().replaceAll(databaseUrl,'[LOCAL_DATABASE_URL]')));
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});assert.equal(code,0);
  console.log(JSON.stringify({check:'LOCAL_FAILED_SETTLEMENT_MIGRATION_ZERO_OBJECTS_RESOLVED',result:'PASS'}));
}
