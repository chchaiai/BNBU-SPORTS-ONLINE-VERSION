import assert from 'node:assert/strict';
import {recoverLegacyReviewContent} from '/app/notification-history.mjs';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
await loadRuntimeSecrets(process.env);const config=validateEnvironment(process.env).RUNTIME_CONFIG;
assert.equal(config.appEnvironment,'production');const db=new PrismaService(config);
try{
 const summary=await db.$transaction(async tx=>{
  await tx.$executeRaw`SET TRANSACTION READ ONLY`;
  const notices=await tx.notification.findMany({where:{notificationType:'EXERCISE_RECORD_RESULT'},take:501,orderBy:{createdAt:'asc'}});
  assert.ok(notices.length<=500,'Bound exceeded; paginate explicitly before continuing');
  const results=[];
  for(const n of notices){
   if(!n.targetId||n.targetType!=='EXERCISE_RECORD'){results.push({id:n.id,result:'UNSUPPORTED_TARGET'});continue;}
   const reviews=await tx.reviewRecord.findMany({where:{organizationId:n.organizationId,recordId:n.targetId,createdAt:{lte:n.createdAt}},select:{result:true,reasonCode:true,publicComment:true}});
   const uuidTime=n.id[14]==='7'?new Date(parseInt(n.id.replaceAll('-','').slice(0,12),16)):n.createdAt;
   const eventBound=new Date(Math.max(n.createdAt.getTime(),uuidTime.getTime()));
   const events=await tx.$queryRaw`SELECT facts FROM v81_events WHERE organization_id=${n.organizationId}::uuid AND resource_id=${n.targetId}::uuid AND resource_type='RECORD_REVIEW' AND occurred_at<=${eventBound} AND id<${n.id}::uuid AND event_type IN ('RETURN_FOR_SUPPLEMENT','FACT_CORRECTED') ORDER BY version`;
   const candidates=reviews.map(r=>({version:1,stage:r.result,reasonCode:r.reasonCode,publicComment:r.publicComment}));
   for(const e of events){if(e.facts?.action==='RETURN_FOR_SUPPLEMENT')for(const stage of ['AWAITING_SUPPLEMENT','PENDING_TEACHER'])candidates.push({version:1,stage,reasonCode:e.facts.reasonCode??null,publicComment:e.facts.publicComment??null});}
   const recovered=recoverLegacyReviewContent(n,candidates);
   let timing;
   if(!recovered){const later=await tx.$queryRaw`SELECT id,occurred_at,facts FROM v81_events WHERE organization_id=${n.organizationId}::uuid AND resource_id=${n.targetId}::uuid AND resource_type='RECORD_REVIEW' AND event_type='RETURN_FOR_SUPPLEMENT' ORDER BY occurred_at`;timing=later.map(e=>({deltaMs:new Date(e.occurred_at).getTime()-n.createdAt.getTime(),eventIdBeforeNotice:e.id<n.id,exactMatch:!!recoverLegacyReviewContent(n,[{version:1,stage:'AWAITING_SUPPLEMENT',reasonCode:e.facts.reasonCode??null,publicComment:e.facts.publicComment??null}])}));}
   results.push({id:n.id,result:recovered?'UNIQUE_MATCH':'NO_UNIQUE_MATCH',...(recovered?{stage:recovered.stage}:{timing})});
  }
  return {total:results.length,matched:results.filter(r=>r.result==='UNIQUE_MATCH').length,results};
 },{timeout:30000});
 console.log(JSON.stringify({check:'READ_ONLY_NOTIFICATION_HISTORY_AUDIT',observedAt:new Date().toISOString(),...summary,scope:'Bounded production history comparison; no mutation and no teacher comments exposed. Review facts use persisted creation time; review events must precede notification UUIDv7 issuance time and ID. Stored title/body must match uniquely.'}));
}finally{await db.$disconnect();}
