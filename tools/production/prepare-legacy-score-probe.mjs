// One explicitly synthetic legacy row for the disabled-correction gate.
// Run through stdin in the current production backend; no real business score is created.
import assert from 'node:assert/strict';
import { v7 as uuidv7 } from 'uuid';
import { loadRuntimeSecrets } from '/app/dist/common/config/file-json-secret-loader.js';
import { validateEnvironment } from '/app/dist/common/config/environment.js';
import { PrismaService } from '/app/dist/common/database/prisma.service.js';
await loadRuntimeSecrets(process.env);
const db = new PrismaService(validateEnvironment(process.env).RUNTIME_CONFIG);
const organizationId = '01a096c2-20a2-706b-8c69-802f67dee12c';
try {
  const result = await db.$transaction(async tx => {
    const e = await tx.enrollment.findUniqueOrThrow({where:{id:'01a096e7-a6ce-73fe-826b-36728b8ba193'}});
    assert.equal(e.organizationId, organizationId);
    assert.equal(e.studentId, '01a096c2-22ee-7102-b7c9-43acfb4c369b');
    assert.equal(e.status, 'ACTIVE');
    assert.equal(await tx.studentScore.count({where:{enrollmentId:e.id}}),0);
    const now = new Date();
    const row = await tx.studentScore.create({data:{id:uuidv7(),organizationId,
      semesterId:e.semesterId,classSectionId:e.classSectionId,studentId:e.studentId,
      enrollmentId:e.id,version:1,createdAt:now,updatedAt:now}});
    return {check:'SYNTHETIC_LEGACY_SCORE_PROBE_FIXTURE',createdAt:now,
      baseline:'Explicitly initialized empty legacy score for denial testing, not a calculated or published result.',row};
  });
  console.log(JSON.stringify(result));
} finally {await db.$disconnect();}
