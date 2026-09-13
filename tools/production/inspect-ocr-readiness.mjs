// Read-only aggregate inspection. Never outputs credentials or personal data.
import { loadRuntimeSecrets } from '/app/dist/common/config/file-json-secret-loader.js';
import { validateEnvironment } from '/app/dist/common/config/environment.js';
import { PrismaService } from '/app/dist/common/database/prisma.service.js';
await loadRuntimeSecrets(process.env);
const config = validateEnvironment(process.env).RUNTIME_CONFIG;
const db = new PrismaService(config);
try {
  const result = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const migrations = await tx.$queryRawUnsafe('SELECT count(*)::int AS completed FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
    const jobs = await tx.$queryRawUnsafe('SELECT status,count(*)::int AS count FROM v81_ocr_jobs GROUP BY status ORDER BY status');
    const services = await tx.$queryRawUnsafe('SELECT provider,region,enabled,count(*)::int AS organizations FROM (SELECT DISTINCT ON (organization_id) provider,region,enabled FROM v81_ocr_service_revisions ORDER BY organization_id,version DESC) latest GROUP BY provider,region,enabled');
    const batches = await tx.$queryRawUnsafe('SELECT count(*)::int AS count FROM v81_ocr_batches');
    const tls = await tx.$queryRawUnsafe('SELECT ssl,version FROM pg_stat_ssl WHERE pid=pg_backend_pid()');
    return {migrations,jobs,services,batches,tls};
  });
  console.log(JSON.stringify({check:'OCR_READINESS_READ_ONLY',observedAt:new Date().toISOString(),runtime:config.ocr,...result}));
} finally { await db.$disconnect(); }
