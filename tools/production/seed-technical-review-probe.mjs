// Explicit test-state fixture, not an AI provider failure observation.
import assert from 'node:assert/strict';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
await loadRuntimeSecrets(process.env);
const db=new PrismaService(validateEnvironment(process.env).RUNTIME_CONFIG);
const id=process.argv[2];assert.match(id,/^[0-9a-f-]{36}$/);
try {
 const result=await db.$transaction(async tx=>{
  const record=await tx.exerciseRecord.findUniqueOrThrow({where:{id}});
  assert.equal(record.organizationId,'01a096c2-20a2-706b-8c69-802f67dee12c');
  assert.equal(record.classSectionId,'01a096e7-a22e-7535-a65d-ce0da82d59af');
  assert.equal(record.description,'Synthetic technical migration to responsible teacher');
  assert.equal(record.status,'SUBMITTED');
  const changed=await tx.$queryRaw`UPDATE v81_record_workflows SET stage='TECHNICAL',version=version+1,updated_at=NOW() WHERE record_id=${id}::uuid AND stage='PENDING_AI' RETURNING record_id,stage,version`;
  assert.equal(changed.length,1);
  return {check:'SYNTHETIC_TECHNICAL_REVIEW_STATE',observedAt:new Date().toISOString(),baseline:'Explicit state initialization; no real AI failure or retry occurred',workflow:changed[0]};
 });console.log(JSON.stringify(result));
}finally{await db.$disconnect();}
