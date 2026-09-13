// Verify denial was non-mutating, then remove only the empty test-created legacy row.
import assert from 'node:assert/strict';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
await loadRuntimeSecrets(process.env);
const db=new PrismaService(validateEnvironment(process.env).RUNTIME_CONFIG);
const id='01a097ae-b46e-76f3-bf06-046d08be476b';
try {
  const result=await db.$transaction(async tx=>{
    const row=await tx.studentScore.findUniqueOrThrow({where:{id}});
    assert.equal(row.organizationId,'01a096c2-20a2-706b-8c69-802f67dee12c');
    assert.equal(row.enrollmentId,'01a096e7-a6ce-73fe-826b-36728b8ba193');
    assert.equal(row.createdAt.toISOString(),'2026-09-12T22:13:24.205Z');
    assert.equal(row.updatedAt.toISOString(),row.createdAt.toISOString());
    assert.equal(row.version,1);assert.equal(row.currentWorkingRevisionId,null);assert.equal(row.publishedRevisionId,null);
    const counts={};
    for(const model of ['studentScoreRevision','scoreAdjustment','scorePublicationEvent','scoreRecalculationAttempt']){
      counts[model]=await tx[model].count({where:{studentScoreId:id}});assert.equal(counts[model],0);
    }
    await tx.studentScore.delete({where:{id}});
    assert.equal(await tx.studentScore.count({where:{id}}),0);
    return {check:'SYNTHETIC_LEGACY_SCORE_PROBE_CLEANUP',observedAt:new Date().toISOString(),scoreId:id,unchangedBeforeCleanup:true,childCounts:counts,removed:true};
  });console.log(JSON.stringify(result));
}finally{await db.$disconnect();}
