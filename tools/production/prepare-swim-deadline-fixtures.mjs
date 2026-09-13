// Controlled historical-time fixtures for HTTP boundary testing, not real elapsed exercise.
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
    const source = await tx.exerciseSession.findUniqueOrThrow({ where: { id: '01a09792-6125-77fd-9093-07ce2afaaafd' } });
    assert.equal(source.organizationId, organizationId);
    assert.equal(source.status, 'COMPLETED');
    const enrollment = await tx.enrollment.findUniqueOrThrow({ where: { id: source.enrollmentId } });
    assert.equal(enrollment.status, 'ACTIVE');
    const policy = await tx.systemPolicy.findUniqueOrThrow({ where: { organizationId } });
    assert.equal(policy.systemMode, 'NORMAL');
    const now = new Date();
    const fixtures = [];
    for (const [name, ageMinutes] of [['inside24h', 1430], ['outside24h', 1450]]) {
      const endedAt = new Date(now.getTime() - ageMinutes * 60000);
      const startedAt = new Date(endedAt.getTime() - 61000);
      const businessDate = new Date(new Date(startedAt.getTime() + 8 * 3600000).toISOString().slice(0, 10) + 'T00:00:00Z');
      const session = await tx.exerciseSession.create({ data: {
        ...source, id: uuidv7(), startedAt, completedAt: endedAt, businessDate,
        actualDurationSeconds: 61n, pausedDurationSeconds: 0n, currentIntervalStartedAt: null,
        createdAt: startedAt, updatedAt: endedAt, lastHeartbeatAt: endedAt, version: 1,
      } });
      await tx.exerciseSessionSegment.create({ data: {
        id: uuidv7(), organizationId, exerciseSessionId: session.id, sequenceNumber: 1,
        segmentType: 'RUNNING', startedAt, endedAt, acceptedDurationSeconds: 61n,
        source: 'SERVER', createdAt: startedAt,
      } });
      fixtures.push({ name, sessionId: session.id, ageMinutes, startedAt, endedAt, businessDate });
    }
    return { check: 'SYNTHETIC_HISTORICAL_SWIM_DEADLINE_FIXTURES', createdAt: now, organizationId,
      baseline: 'New test-only sessions with deliberately historical times; no existing session timestamps changed. Not evidence of real 24-hour elapsed exercise.', fixtures };
  });
  console.log(JSON.stringify(result));
} finally { await db.$disconnect(); }
