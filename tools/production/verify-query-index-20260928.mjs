import assert from 'node:assert/strict';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
import {Prisma} from '/app/dist/generated/prisma/client.js';
import {projectV81Records} from '/app/dist/modules/v8/v81-record-projection.js';
await loadRuntimeSecrets(process.env);
const db=new PrismaService(validateEnvironment(process.env).RUNTIME_CONFIG);
try {
const result=await db.$transaction(async tx=>{
 await tx.$executeRaw`SET TRANSACTION READ ONLY`;
 await tx.$executeRaw`SET LOCAL statement_timeout = '5s'`;
 const ids=await tx.$queryRaw`SELECT record_id::text AS id FROM v81_record_workflows ORDER BY record_id DESC LIMIT 30`;
 assert.ok(ids.length);
 const cases=[];
 for(const count of [1,ids.length]) {
  const records=ids.slice(0,count);let captured;const stop=new Error('captured');
  try {await projectV81Records({$queryRaw(...args){captured=Prisma.sql(...args);throw stop}},records)}catch(e){if(e!==stop)throw e}
  assert.ok(captured);assert.ok(!captured.sql.includes('w.record_id::text'));
  const old=Prisma.sql`SELECT w.record_id,w.stage,w.material_version,w.public_reason,w.public_comment,w.version,coalesce(p.eligible_minutes,0) AS eligible_minutes,coalesce(p.credited_minutes,0) AS credited_minutes,p.reason FROM v81_record_workflows w LEFT JOIN v81_credit_projections p ON p.record_id=w.record_id WHERE w.record_id::text IN (${Prisma.join(records.map(x=>x.id))})`;
  const a=await tx.$queryRaw(old),b=await tx.$queryRaw(captured);
  const sort=a=>a.sort((x,y)=>x.record_id.localeCompare(y.record_id));assert.deepEqual(sort(a),sort(b));
  const plan=await tx.$queryRaw(Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${captured}`);
  cases.push({count,equal:true,executionMs:plan[0]['QUERY PLAN'][0]['Execution Time']});
 }
 return {result:'PASS',actualRuntimeQueryVerified:true,cases};
},{timeout:20000});console.log(JSON.stringify(result));
}finally{await db.$disconnect()}
