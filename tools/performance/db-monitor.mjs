import fs from 'node:fs';
import pg from 'pg';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {createPrismaPgConfiguration} from '/app/dist/common/database/postgres-tls.js';
await loadRuntimeSecrets(process.env);
const c=validateEnvironment(process.env).RUNTIME_CONFIG;
const pool=new pg.Pool({...createPrismaPgConfiguration(c.databaseUrl,c.tencentDbCaFile).pool,max:1,application_name:'bnbu-performance-observer',statement_timeout:2000,connectionTimeoutMillis:2000});
const end=Date.now()+3600000;
try {
 while(Date.now()<end && !fs.existsSync('/perf/stop')) {
  const result={time:new Date().toISOString()};
  try {
   result.activity=(await pool.query(`SELECT usename,state,wait_event_type,wait_event,count(*)::int AS connections FROM pg_stat_activity WHERE datname=current_database() AND application_name <> 'bnbu-performance-observer' GROUP BY 1,2,3,4`)).rows;
   result.database=(await pool.query(`SELECT numbackends,xact_commit::text,xact_rollback::text,blks_read::text,blks_hit::text,tup_returned::text,tup_fetched::text,tup_inserted::text,tup_updated::text,deadlocks::text,temp_bytes::text FROM pg_stat_database WHERE datname=current_database()`)).rows[0];
   result.settings=(await pool.query(`SELECT name,setting,unit FROM pg_settings WHERE name IN ('max_connections','shared_buffers','work_mem','effective_cache_size','track_io_timing','max_worker_processes')`)).rows;
   result.locks=(await pool.query(`SELECT count(*)::int AS waiting FROM pg_locks WHERE NOT granted`)).rows[0];
  }catch(e){result.error=e.code||e.name;}
  fs.writeFileSync('/perf/db-latest.json',JSON.stringify(result),{mode:0o644});
  fs.appendFileSync('/perf/db-samples.jsonl',JSON.stringify(result)+'\n',{mode:0o644});
  await new Promise(r=>setTimeout(r,5000));
 }
}finally{await pool.end();}
