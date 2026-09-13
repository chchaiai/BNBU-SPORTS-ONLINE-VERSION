import assert from 'node:assert/strict';
import {recoverLegacyReviewContent} from '/app/dist/modules/v8/domain/notification-history.js';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';

const apply = process.argv.includes('--apply');
assert.ok(apply || process.argv.includes('--dry-run'), 'Explicit mode required');
await loadRuntimeSecrets(process.env);
const config = validateEnvironment(process.env).RUNTIME_CONFIG;
assert.equal(config.appEnvironment, 'production');
const db = new PrismaService(config);
const rollback = new Error('VERIFIED_DRY_RUN_ROLLBACK');
let result;
try {
  try {
    await db.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`;
      const notices = await tx.$queryRaw`SELECT id, organization_id AS "organizationId", target_id AS "targetId", target_type AS "targetType", notification_type AS "notificationType", title, body, created_at AS "createdAt" FROM notifications WHERE notification_type='EXERCISE_RECORD_RESULT' AND review_content IS NULL ORDER BY created_at LIMIT 501 FOR UPDATE`;
      assert.ok(notices.length <= 500, 'Bound exceeded');
      const results = [];
      for (const n of notices) {
        assert.equal(n.targetType, 'EXERCISE_RECORD');
        assert.ok(n.targetId);
        const reviews = await tx.reviewRecord.findMany({where: {organizationId:n.organizationId,recordId:n.targetId,createdAt:{lte:n.createdAt}},select:{result:true,reasonCode:true,publicComment:true}});
        const uuidTime = n.id[14] === '7' ? new Date(parseInt(n.id.replaceAll('-','').slice(0,12),16)) : n.createdAt;
        const eventBound = new Date(Math.max(n.createdAt.getTime(),uuidTime.getTime()));
        const events = await tx.$queryRaw`SELECT facts FROM v81_events WHERE organization_id=${n.organizationId}::uuid AND resource_id=${n.targetId}::uuid AND resource_type='RECORD_REVIEW' AND occurred_at<=${eventBound} AND id<${n.id}::uuid AND event_type IN ('RETURN_FOR_SUPPLEMENT','FACT_CORRECTED') ORDER BY version`;
        const candidates = reviews.map(r=>({version:1,stage:r.result,reasonCode:r.reasonCode,publicComment:r.publicComment}));
        for (const e of events) if (e.facts?.action === 'RETURN_FOR_SUPPLEMENT') {
          for (const stage of ['AWAITING_SUPPLEMENT','PENDING_TEACHER']) candidates.push({version:1,stage,reasonCode:e.facts.reasonCode??null,publicComment:e.facts.publicComment??null});
        }
        const recovered = recoverLegacyReviewContent(n,candidates);
        assert.ok(recovered, 'No unique immutable history match for ' + n.id);
        const affected = await tx.$executeRaw`UPDATE notifications SET review_content=${JSON.stringify(recovered)}::jsonb WHERE id=${n.id}::uuid AND organization_id=${n.organizationId}::uuid AND review_content IS NULL AND title=${n.title} AND body=${n.body}`;
        assert.equal(affected,1);
        const after = await tx.notification.findUniqueOrThrow({where:{id:n.id}});
        assert.deepEqual(after.reviewContent,recovered);
        assert.equal(after.title,n.title);
        assert.equal(after.body,n.body);
        results.push({id:n.id,stage:recovered.stage});
      }
      result = {result:'PASS',mode:apply?'APPLIED':'DRY_RUN_ROLLED_BACK',count:results.length,results};
      if (!apply) throw rollback;
    },{timeout:30000});
  } catch(error) {
    if(error !== rollback) throw error;
  }
  console.log(JSON.stringify(result));
} finally {
  await db.$disconnect();
}
