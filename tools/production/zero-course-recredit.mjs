import assert from 'node:assert/strict';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
import {recomputeCredits} from '/app/dist/modules/v8/v81-credit-store.js';
import {appendV81SystemEvent} from '/app/dist/modules/v8/v81-system-event.js';
await loadRuntimeSecrets(process.env);const config=validateEnvironment(process.env).RUNTIME_CONFIG;
assert.equal(config.appEnvironment,'production');assert.equal(config.publicOrganizationCode,'BNBU');
const db=new PrismaService(config),mode=process.argv[2],batch='student-account-goals-20260920';
assert.ok(['--plan','--apply','--verify','--rollback'].includes(mode));
try {
 const org=await db.organization.findUniqueOrThrow({where:{organizationCode:'BNBU'}});
 const rows=await db.$queryRaw`SELECT e.id,count(r.id)::int AS records,count(r.id) FILTER(WHERE w.stage='VALID')::int AS valid,
   coalesce(sum(p.credited_minutes),0)::int AS credited
   FROM enrollments e JOIN v81_course_rules cr ON cr.class_section_id=e.class_section_id AND cr.course_target=0 AND cr.published_at IS NOT NULL
   JOIN exercise_records r ON r.enrollment_id=e.id AND r.credit_type='COURSE_RELATED'
   LEFT JOIN v81_record_workflows w ON w.record_id=r.id LEFT JOIN v81_credit_projections p ON p.record_id=r.id
   WHERE e.organization_id=${org.id}::uuid GROUP BY e.id ORDER BY e.id`;
 const summary={enrollments:rows.length,records:rows.reduce((n,r)=>n+r.records,0),valid:rows.reduce((n,r)=>n+r.valid,0),previousCourseMinutes:rows.reduce((n,r)=>n+r.credited,0)};
 if(mode==='--plan'){console.log(JSON.stringify({result:'PLAN',...summary}));}
 else if(mode==='--apply'||mode==='--rollback'){
  const result=await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM organizations WHERE id=${org.id}::uuid FOR UPDATE`;
   const done=await tx.$queryRaw`SELECT id FROM v81_events WHERE organization_id=${org.id}::uuid AND request_id=${batch} AND event_type='ZERO_COURSE_CREDIT_REALLOCATED'`;
   if(done.length && mode==='--apply')return {alreadyApplied:true};
   let generalMinutes=0;
   for(const row of rows){const calculated=await recomputeCredits(tx,row.id,new Date());generalMinutes+=calculated.generalMinutes;assert.equal(calculated.courseMinutes,0);}
   await appendV81SystemEvent(tx,{organizationId:org.id,resourceType:'ORGANIZATION',resourceId:org.id,eventType:mode==='--rollback'?'ZERO_COURSE_CREDIT_ROLLED_BACK':'ZERO_COURSE_CREDIT_REALLOCATED',
    requestId:batch,version:1,occurredAt:new Date(),outcome:'SUCCEEDED',facts:{...summary,generalMinutes,rule:'COURSE_ZERO_TO_GENERAL',originalRecordCategoriesPreserved:true}});
   return {generalMinutes};
  },{timeout:180000,maxWait:10000});
  console.log(JSON.stringify({result:'PASS',...summary,...result}));
 } else {
  const [event]=await db.$queryRaw`SELECT facts FROM v81_events WHERE organization_id=${org.id}::uuid AND request_id=${batch} AND event_type='ZERO_COURSE_CREDIT_REALLOCATED'`;
  assert.ok(event);
  const totals=await db.$queryRaw`SELECT coalesce(sum(p.credited_minutes),0)::int AS credited_course_records,
    count(*) FILTER(WHERE w.stage<>'VALID' AND p.credited_minutes>0)::int AS invalid_credited
    FROM exercise_records r JOIN enrollments e ON e.id=r.enrollment_id JOIN v81_course_rules cr ON cr.class_section_id=e.class_section_id AND cr.course_target=0
    JOIN v81_credit_projections p ON p.record_id=r.id JOIN v81_record_workflows w ON w.record_id=r.id
    WHERE e.organization_id=${org.id}::uuid AND r.credit_type='COURSE_RELATED'`;
  assert.equal(totals[0].invalid_credited,0);console.log(JSON.stringify({result:'PASS',...summary,after:totals[0],event:event.facts}));
 }
} finally {await db.$disconnect();}
