// Read-only, aggregated diagnostics; does not return accounts, payloads or URLs.
import { loadRuntimeSecrets } from '/app/dist/common/config/file-json-secret-loader.js';
import { validateEnvironment } from '/app/dist/common/config/environment.js';
import { PrismaService } from '/app/dist/common/database/prisma.service.js';
await loadRuntimeSecrets(process.env);
const client = new PrismaService(validateEnvironment(process.env).RUNTIME_CONFIG);
try {
 const rows=await client.$queryRawUnsafe(`SELECT safe_metadata->>'errorCode' AS code,
 safe_metadata->>'category' AS category,safe_metadata->>'httpStatus' AS status,count(*)::int AS count
 FROM audit_logs WHERE action_type='CLIENT_ERROR_REPORTED' AND occurred_at>now()-interval '12 hours'
 GROUP BY 1,2,3 ORDER BY count(*) DESC`);
 console.log(JSON.stringify({check:'client-diagnostic-counts',rows,
 runtimeLogDirectoryConfigured:Boolean(process.env.RUNTIME_LOG_DIRECTORY)}));
} catch(error) { console.log(JSON.stringify({check:'client-diagnostic-counts',errorType:error.name,code:error.code}));process.exitCode=1;
} finally {await client.$disconnect();}
