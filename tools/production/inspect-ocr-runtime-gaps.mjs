// Aggregate-only read check: no message bodies, personal data or credentials.
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
await loadRuntimeSecrets(process.env);const db=new PrismaService(validateEnvironment(process.env).RUNTIME_CONFIG);
try{const result=await db.$transaction(async tx=>{
 await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');const now=new Date();
 const androidPolicies=await tx.appReleasePolicy.count({where:{platform:'ANDROID',effectiveAt:{lte:now},OR:[{expiresAt:null},{expiresAt:{gt:now}}]}});
 const outbox=await tx.$queryRaw`SELECT status,event_type,count(*)::int AS count,min(created_at) AS oldest,max(attempts)::int AS max_attempts FROM outbox_events WHERE status IN ('PENDING','FAILED') GROUP BY status,event_type ORDER BY count(*) DESC LIMIT 20`;
 return {androidEffectivePolicies:androidPolicies,outbox};
 });console.log(JSON.stringify({check:'CLOUD_RUNTIME_GAPS_READ_ONLY',observedAt:new Date().toISOString(),...result}));
}finally{await db.$disconnect();}
