import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import pg from '../../backend/node_modules/pg/lib/index.js';

// Independent execution evidence for SQL files, not Prisma migration history,
// client generation, application startup, or a production upgrade procedure.
const client=new pg.Client({host:process.env.PGHOST,port:5432,database:process.env.PGDATABASE,
  user:process.env.PGUSER,password:process.env.PGPASSWORD});
const root=new URL('../../backend/prisma/migrations/',import.meta.url);
let current='connect';
try {
  await client.connect();
  const existing=await client.query("SELECT count(*)::integer AS count FROM pg_tables WHERE schemaname='public'");
  if(existing.rows[0].count!==0)throw new Error('SQL probe requires its own empty database; existing data is never reset');
  const directories=fs.readdirSync(root,{withFileTypes:true}).filter(entry=>entry.isDirectory()&&/^\d{4}_/.test(entry.name)).map(entry=>entry.name).sort();
  for(const directory of directories) {
    current=directory;
    const sql=fs.readFileSync(new URL(`${directory}/migration.sql`,root),'utf8');
    const hash=createHash('sha256').update(sql).digest('hex');
    const manifest=JSON.parse(fs.readFileSync(new URL(`${directory}/manifest.json`,root),'utf8'));
    if(manifest.sha256!==hash)throw new Error('Migration manifest checksum differs from SQL bytes');
    await client.query('BEGIN');
    try { await client.query(sql); await client.query('COMMIT'); }
    catch(error) { await client.query('ROLLBACK'); throw error; }
    process.stdout.write(JSON.stringify({migration:directory,sha256:hash,result:'APPLIED'})+'\n');
  }
  const tables=await client.query("SELECT count(*)::integer AS count FROM pg_tables WHERE schemaname='public'");
  const v81=await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'v81_%' ORDER BY tablename");
  process.stdout.write(JSON.stringify({result:'SQL_FILES_APPLIED',migrations:directories.length,tableCount:tables.rows[0].count,v81Tables:v81.rows.map(row=>row.tablename),prismaValidated:false,applicationValidated:false})+'\n');
} catch(error) {
  process.stderr.write(JSON.stringify({result:'FAILED',step:current,code:error.code??null,message:error.message})+'\n');
  process.exitCode=1;
} finally {
  await client.end().catch(()=>undefined);
}
