import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
await loadRuntimeSecrets(process.env);const config=validateEnvironment(process.env).RUNTIME_CONFIG;
if(config.appEnvironment!=='production')throw new Error('Production required');
const db=new PrismaService(config),cutoff=new Date('2026-09-18T05:45:50Z');
try{
 if(!config.publicOrganizationCode)throw new Error('Public organization binding required');
 const org=await db.organization.findUniqueOrThrow({where:{organizationCode:config.publicOrganizationCode}});
 const result=await db.$transaction(async tx=>{
 await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
 const ordinary=await tx.$queryRaw`SELECT w.stage,r.status,count(*)::int AS records,count(DISTINCT r.student_id)::int AS students,
   coalesce(sum(p.credited_minutes),0)::int AS credited_minutes,
   count(*) FILTER(WHERE snap.record_id IS NULL)::int AS missing_rule_snapshots,
   count(*) FILTER(WHERE r.actual_duration_seconds<snap.minimum_minutes*60)::int AS below_threshold,
   count(*) FILTER(WHERE EXISTS(SELECT 1 FROM v81_settlement_report_revisions x WHERE x.class_section_id=r.class_section_id))::int AS settled_records
 FROM exercise_records r LEFT JOIN v81_record_workflows w ON w.record_id=r.id
 LEFT JOIN v81_credit_projections p ON p.record_id=r.id LEFT JOIN v81_record_rule_snapshots snap ON snap.record_id=r.id
 WHERE r.organization_id=${org.id}::uuid AND r.submitted_at IS NOT NULL AND r.submitted_at<=${cutoff}
 AND NOT EXISTS(SELECT 1 FROM v81_history_session_sources h WHERE h.session_id=r.session_id)
 GROUP BY w.stage,r.status ORDER BY w.stage,r.status`;
 const credits=await tx.$queryRaw`SELECT p.reason,count(*)::int AS records,coalesce(sum(p.eligible_minutes),0)::int AS eligible_minutes,coalesce(sum(p.credited_minutes),0)::int AS credited_minutes
 FROM exercise_records r LEFT JOIN v81_credit_projections p ON p.record_id=r.id
 WHERE r.organization_id=${org.id}::uuid AND r.submitted_at IS NOT NULL AND r.submitted_at<=${cutoff}
 AND NOT EXISTS(SELECT 1 FROM v81_history_session_sources h WHERE h.session_id=r.session_id)
 GROUP BY p.reason ORDER BY p.reason`;
 const makeup=await tx.$queryRaw`SELECT w.stage,count(*)::int AS records,coalesce(sum(p.credited_minutes),0)::int AS credited_minutes
 FROM exercise_records r JOIN v81_history_session_sources h ON h.session_id=r.session_id
 LEFT JOIN v81_record_workflows w ON w.record_id=r.id LEFT JOIN v81_credit_projections p ON p.record_id=r.id
 WHERE r.organization_id=${org.id}::uuid AND r.submitted_at IS NOT NULL AND r.submitted_at<=${cutoff} GROUP BY w.stage ORDER BY w.stage`;
 return {organizationCode:org.organizationCode,cutoff:cutoff.toISOString(),ordinary,credits,makeup};
 },{isolationLevel:'RepeatableRead'});console.log(JSON.stringify(result));
}finally{await db.$disconnect();}
