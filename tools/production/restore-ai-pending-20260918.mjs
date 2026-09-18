import {randomUUID} from 'node:crypto';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
import {recomputeCredits} from '/app/dist/modules/v8/v81-credit-store.js';
import {appendV81SystemEvent} from '/app/dist/modules/v8/v81-system-event.js';
await loadRuntimeSecrets(process.env);const config=validateEnvironment(process.env).RUNTIME_CONFIG;
if(config.appEnvironment!=='production')throw new Error('Production host required');
const db=new PrismaService(config);let restored=0;
try{
 const candidates=await db.$queryRaw`SELECT r.id,r.organization_id FROM exercise_records r JOIN v81_record_workflows w ON w.record_id=r.id JOIN semesters s ON s.id=r.semester_id
 WHERE w.stage='PENDING_TEACHER' AND w.material_version=1 AND s.status='CURRENT'
 AND NOT EXISTS(SELECT 1 FROM v81_history_session_sources h WHERE h.session_id=r.session_id)
 AND NOT EXISTS(SELECT 1 FROM v81_settlement_report_revisions x WHERE x.class_section_id=r.class_section_id)
 AND EXISTS(SELECT 1 FROM review_records rr WHERE rr.record_id=r.id AND rr.review_version=(SELECT max(review_version) FROM review_records WHERE record_id=r.id) AND rr.teacher_id IS NULL AND rr.reason='AI_EXCEPTION_REVIEW')`;
 if(process.argv.includes('--apply'))for(const item of candidates){restored+=await db.$transaction(async tx=>{
 await tx.$queryRaw`SELECT id FROM organizations WHERE id=${item.organization_id}::uuid FOR NO KEY UPDATE`;
 const record=await tx.exerciseRecord.findUniqueOrThrow({where:{id:item.id}}),last=await tx.reviewRecord.findFirstOrThrow({where:{recordId:item.id},orderBy:{reviewVersion:'desc'}});
 const w=await tx.$queryRaw`SELECT * FROM v81_record_workflows WHERE record_id=${item.id}::uuid FOR UPDATE`;
 if(last.teacherId||last.reason!=='AI_EXCEPTION_REVIEW'||w[0]?.stage!=='PENDING_TEACHER')return 0;
 if((await tx.$queryRaw`SELECT id FROM v81_settlement_report_revisions WHERE class_section_id=${record.classSectionId}::uuid`).length)return 0;
 const now=new Date();await tx.reviewRecord.create({data:{id:randomUUID(),organizationId:item.organization_id,recordId:item.id,reviewVersion:last.reviewVersion+1,previousReviewId:last.id,result:'VALID',publicComment:'普通打卡默认有效，AI 抽查仅提供建议。',reviewedAt:now,createdAt:now}});
 await tx.$executeRaw`UPDATE v81_record_workflows SET stage='VALID',public_reason=NULL,public_comment=NULL,teacher_round_started_at=NULL,version=version+1,updated_at=${now} WHERE record_id=${item.id}::uuid`;
 await tx.exerciseRecord.update({where:{id:item.id,version:record.version},data:{status:'REVIEWED',version:{increment:1},updatedAt:now}});
 await appendV81SystemEvent(tx,{organizationId:item.organization_id,resourceType:'RECORD_REVIEW',resourceId:item.id,eventType:'DEFAULT_VALID_POLICY_RESTORED',requestId:randomUUID(),version:w[0].version+1,occurredAt:now,outcome:'SUCCEEDED',facts:{previousStage:'PENDING_TEACHER',previousReviewId:last.id}});
 await recomputeCredits(tx,record.enrollmentId,now);return 1;});}
 console.log(JSON.stringify({result:'PASS',eligible:candidates.length,restored,mode:process.argv.includes('--apply')?'apply':'inspect'}));
}finally{await db.$disconnect();}
