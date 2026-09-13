// Read-only aggregate proof for this task's synthetic organization only.
import assert from 'node:assert/strict';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
await loadRuntimeSecrets(process.env);const db=new PrismaService(validateEnvironment(process.env).RUNTIME_CONFIG);
const organizationId='01a096c2-20a2-706b-8c69-802f67dee12c',sectionId='01a096c2-20a3-76a6-a0b4-15a89a04610b';
try{const result=await db.$transaction(async tx=>{
 await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
 const course=await tx.classSection.findUniqueOrThrow({where:{id:sectionId},select:{organizationId:true,status:true,closedAt:true}});assert.equal(course.organizationId,organizationId);assert.equal(course.status,'CLOSED');
 const members=await tx.enrollment.findMany({where:{classSectionId:sectionId},select:{status:true,endReason:true,endedAt:true}});assert.equal(members.length,2);assert.ok(members.every(e=>e.status==='REMOVED'&&e.endReason==='COURSE_CLOSED'&&e.endedAt?.getTime()===course.closedAt?.getTime()));
 const apps=await tx.$queryRaw`SELECT count(*)::int AS retained,count(*) FILTER(WHERE membership_cleared_at IS NOT NULL AND status='REVOKED')::int AS cleared FROM exemption_applications WHERE organization_id=${organizationId}::uuid`;
 assert.equal(apps[0].retained,3);assert.equal(apps[0].cleared,3);
 const credits=await tx.$queryRaw`SELECT count(*)::int AS retained,count(*) FILTER(WHERE active)::int AS active FROM v81_certification_credits WHERE organization_id=${organizationId}::uuid`;
 assert.equal(credits[0].retained,1);assert.equal(credits[0].active,0);
 const records=await tx.exerciseRecord.count({where:{organizationId}});assert.equal(records,1);
 const jobs=await tx.$queryRaw`SELECT status,count(*)::int AS count FROM v81_ocr_jobs WHERE organization_id=${organizationId}::uuid GROUP BY status`;assert.deepEqual(jobs,[{status:'SUCCEEDED',count:2}]);
 return {members:members.length,applications:apps[0],credits:credits[0],historicalExerciseRecords:records,ocrJobs:jobs};
 });console.log(JSON.stringify({check:'CLOUD_CLOSURE_DATABASE_READ_ONLY',observedAt:new Date().toISOString(),status:'PASS',organizationId,...result}));
}finally{await db.$disconnect();}
