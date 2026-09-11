import fs from 'node:fs';
import pg from 'pg';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {createPrismaPgConfiguration} from '/app/dist/common/database/postgres-tls.js';
await loadRuntimeSecrets(process.env);const c=validateEnvironment(process.env).RUNTIME_CONFIG;
const pool=new pg.Pool({...createPrismaPgConfiguration(c.databaseUrl,c.tencentDbCaFile).pool,max:1,application_name:'bnbu-performance-inspect',statement_timeout:2000});
const out={time:new Date().toISOString()};
try{
 for(const [key,sql] of Object.entries({version:'SELECT version(),pg_database_size(current_database())::text AS database_bytes',tables:"SELECT relname,n_live_tup::text,n_dead_tup::text,seq_scan::text,seq_tup_read::text,idx_scan::text FROM pg_stat_user_tables ORDER BY pg_stat_user_tables.n_live_tup DESC LIMIT 20",extensions:'SELECT extname FROM pg_extension',stats:"SELECT count(*)::int AS statements,sum(calls)::text AS calls,sum(total_exec_time)::text AS exec_ms,sum(shared_blks_read)::text AS reads,sum(shared_blks_hit)::text AS hits,sum(temp_blks_written)::text AS temp_writes FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database())"})){
  try{out[key]=(await pool.query(sql)).rows;}catch(e){out[key]={error:e.code||e.name};}
 }
 const state=JSON.parse(fs.readFileSync('/perf/private.json'));
 const ids=(await pool.query('SELECT id FROM exercise_records WHERE organization_id=$1::uuid LIMIT 10',[state.fixture.organizationId])).rows.map(r=>r.id);
 if(ids.length){
  for(const [name,filter] of [['currentTextCast','w.record_id::text = ANY($1::text[])'],['typedUuidComparison','w.record_id = ANY($1::uuid[])']]){
   out[name]=(await pool.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT w.record_id,w.stage,p.credited_minutes FROM v81_record_workflows w LEFT JOIN v81_credit_projections p ON p.record_id=w.record_id WHERE '+filter,[ids])).rows;
  }
 }
 out.fixture=(await pool.query(`SELECT (SELECT count(*)::int FROM users WHERE organization_id=$1) AS users,(SELECT count(*)::int FROM users WHERE organization_id=$1 AND status='ACTIVE') AS active_users,(SELECT count(*)::int FROM enrollments WHERE organization_id=$1) AS enrollments,(SELECT count(*)::int FROM exercise_sessions WHERE organization_id=$1) AS sessions,(SELECT count(*)::int FROM exercise_sessions WHERE organization_id=$1 AND status IN ('IN_PROGRESS','PAUSED')) AS open_sessions,(SELECT count(*)::int FROM exercise_records WHERE organization_id=$1) AS records`,[state.fixture.organizationId])).rows;
 console.log(JSON.stringify(out,null,2));
}finally{await pool.end();}
