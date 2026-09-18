import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
import {recomputeCredits} from '/app/dist/modules/v8/v81-credit-store.js';
import {appendV81SystemEvent} from '/app/dist/modules/v8/v81-system-event.js';
import {applyOrdinaryHistory,ordinaryHistorySummary} from '/app/history-core.mjs';
await loadRuntimeSecrets(process.env);const config=validateEnvironment(process.env).RUNTIME_CONFIG;
if(config.appEnvironment!=='production'||config.publicOrganizationCode!=='BNBU')throw new Error('BNBU production binding required');
const db=new PrismaService(config),cutoff=new Date('2026-09-18T05:45:50Z'),batchId='d2c5ef40-9c70-4f24-88d4-a1c33d24a918';
try{
 const org=await db.organization.findUniqueOrThrow({where:{organizationCode:'BNBU'}});
 if(process.argv.includes('--apply')){
   const result=await db.$transaction(tx=>applyOrdinaryHistory(tx,{organizationId:org.id,cutoff,expectedRecords:372,batchId,
     recomputeCredits,appendEvent:appendV81SystemEvent}),{timeout:180000,maxWait:10000});
   console.log(JSON.stringify({result:'PASS',batchId,...result}));
 }else if(process.argv.includes('--verify')){
   const events=await db.$queryRaw`SELECT facts FROM v81_events WHERE organization_id=${org.id}::uuid
     AND event_type='ORDINARY_HISTORY_VALID_APPLIED' AND request_id=${batchId}`;
   if(events.length!==1)throw new Error('Completion marker missing or duplicated');
   const after=await ordinaryHistorySummary(db,org.id,cutoff);
   if(after.records!==372||after.not_valid!==0||after.missing_credit_projection!==0)throw new Error('History verification failed');
   console.log(JSON.stringify({result:'PASS',batchId,after,completion:events[0].facts}));
 }else throw new Error('Explicit mode required');
}finally{await db.$disconnect();}
