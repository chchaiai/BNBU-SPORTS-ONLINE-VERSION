// Read-only production inspection: aggregate state, never identities or secrets.
import { loadRuntimeSecrets } from '/app/dist/common/config/file-json-secret-loader.js';
import { validateEnvironment } from '/app/dist/common/config/environment.js';
import { PrismaService } from '/app/dist/common/database/prisma.service.js';
await loadRuntimeSecrets(process.env);
const db = new PrismaService(validateEnvironment(process.env).RUNTIME_CONFIG);
try {
  const rows = await db.$queryRawUnsafe(`SELECT w.stage,count(*)::int AS count
    FROM v81_record_workflows w JOIN organizations o ON o.id=w.organization_id
    WHERE o.organization_code='BNBU' GROUP BY w.stage`);
  const manual = await db.$queryRawUnsafe(`SELECT m.enabled,count(*)::int AS count FROM v81_manual_modes m
    JOIN organizations o ON o.id=m.organization_id WHERE o.organization_code='BNBU' GROUP BY m.enabled`);
  const notices = await db.$queryRawUnsafe(`SELECT e.version,e.facts->>'from' AS before,e.facts->>'to' AS after,
    e.facts->>'announcementPublished' AS published FROM v81_events e JOIN organizations o ON o.id=e.organization_id
    WHERE o.organization_code='BNBU' AND e.resource_type='SYSTEM_MODE' ORDER BY e.version DESC LIMIT 5`);
  console.log(JSON.stringify({check:'ROUND2_READ_ONLY_STATE',workflows:rows,manualModes:manual,modes:notices}));
} finally { await db.$disconnect(); }
