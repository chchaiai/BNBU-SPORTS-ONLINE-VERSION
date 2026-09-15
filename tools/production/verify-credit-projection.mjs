// Production calculation probe: writes only to a temporary projection table.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '/app/dist/generated/prisma/client.js';
import { createPrismaPgConfiguration } from '/app/dist/common/database/postgres-tls.js';
import { recomputeCredits } from '/app/dist/modules/v8/v81-credit-store.js';

const secret = JSON.parse(fs.readFileSync('/run/secrets/runtime.json', 'utf8'));
const cfg = createPrismaPgConfiguration(secret.DATABASE_URL, '/run/secrets/tencentdb-ca-chain.pem');
const db = new PrismaClient({ adapter: new PrismaPg({ ...cfg.pool, max: 1,
  options: '-c statement_timeout=5000 -c lock_timeout=1000' }, {schema: cfg.schema}), log: [] });
const recordIds = ['01a09d8e-0982-7398-9c44-946d27f9616b', '01a09d89-c8fa-754f-aa16-c659f1a0f0f8'];
const checks = [];
function template(parts, transform) {
  const mapped = parts.map(transform);
  Object.defineProperty(mapped, 'raw', {value: mapped.slice()});
  return mapped;
}
try {
  await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('CREATE TEMP TABLE credit_projection_probe (LIKE public.v81_credit_projections INCLUDING ALL) ON COMMIT DROP');
    await tx.$executeRawUnsafe('INSERT INTO pg_temp.credit_projection_probe SELECT * FROM public.v81_credit_projections');
    for (const [index, id] of recordIds.entries()) {
      const record = await tx.exerciseRecord.findUniqueOrThrow({where: {id}, select: {enrollmentId: true}});
      for (const valid of [true, false]) {
        const proxy = {
          $queryRaw: async (parts, ...values) => {
            const rows = await tx.$queryRaw(template(parts, part => part.replace(/ FOR UPDATE\b/g, '')), ...values);
            return parts.join('?').includes('snapshot.maximum_minutes')
              ? rows.map(row => row.id === id ? {...row, valid} : row) : rows;
          },
          $executeRaw: async (parts, ...values) => {
            assert.match(parts.join('?'), /^\s*INSERT INTO v81_credit_projections\(/);
            return tx.$executeRaw(template(parts, part => part
              .replace('INSERT INTO v81_credit_projections(', 'INSERT INTO pg_temp.credit_projection_probe(')
              .replace('v81_credit_projections.version', 'credit_projection_probe.version')), ...values);
          },
        };
        const calculated = await recomputeCredits(proxy, record.enrollmentId, new Date());
        const expected = calculated.records.find(item => item.id === id);
        assert.ok(expected);
        const row = (await tx.$queryRaw`SELECT eligible_minutes,credited_minutes,selected FROM pg_temp.credit_projection_probe WHERE record_id=${id}::uuid`)[0];
        assert.equal(row.eligible_minutes, index === 0 ? 65 : 76);
        assert.equal(row.credited_minutes, expected.creditedMinutes);
        assert.equal(row.selected, expected.selected);
        assert.ok(row.credited_minutes >= 0 && row.credited_minutes <= row.eligible_minutes);
        if (!valid) assert.equal(row.credited_minutes, 0);
        checks.push({recordId: id, simulatedReview: valid ? 'VALID' : 'AWAITING_SUPPLEMENT', ...row,
          calculationReason: expected.reason, totalMinutes: calculated.totalMinutes});
      }
    }
  }, {timeout: 20000});
  console.log(JSON.stringify({result: 'PASS', checks, writeScope: 'TEMPORARY_TABLE_ONLY', realReviewsChanged: false}));
} finally { await db.$disconnect(); }
