import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {S3Client,HeadObjectCommand} from '@aws-sdk/client-s3';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
import {storageCredentials} from '/app/dist/common/object-storage/tencent-cvm-role-credential-provider.js';
await loadRuntimeSecrets(process.env);
const config=validateEnvironment(process.env).RUNTIME_CONFIG,db=new PrismaService(config);
assert.equal(config.appEnvironment,'production');assert.ok(config.objectStorage);
const storage=new S3Client({...config.objectStorage,credentials:storageCredentials(config.objectStorage.credentials)});
try {
 const fixture=JSON.parse(readFileSync('/acceptance/student-deletion-checkin.json','utf8'));
 const submission=JSON.parse(readFileSync('/acceptance/student-deletion-submission.json','utf8'));
 const org=await db.organization.findUniqueOrThrow({where:{id:fixture.fixture.organizationId}});assert.ok(org.organizationCode.includes('-ERASE-'));
 assert.equal(submission.studentId,fixture.student.studentId);
 const studentId=fixture.student.studentId,userId=fixture.student.userId,recordId=submission.recordId;
 const remaining={users:await db.user.count({where:{id:userId}}),profiles:await db.studentProfile.count({where:{id:studentId}}),
   enrollments:await db.enrollment.count({where:{studentId}}),sessions:await db.exerciseSession.count({where:{studentId}}),
   records:await db.exerciseRecord.count({where:{studentId}}),reviews:await db.reviewRecord.count({where:{recordId}}),
   media:await db.mediaEvidence.count({where:{ownerStudentId:studentId}}),scores:await db.studentScore.count({where:{studentId}}),
   loginSessions:await db.authSession.count({where:{userId}})};
 assert.ok(Object.values(remaining).every(count=>count===0));
 const [credit]=await db.$queryRaw`SELECT count(*)::integer n FROM v81_credit_projections WHERE record_id=${recordId}::uuid`;assert.equal(credit.n,0);
 const peers=await db.enrollment.findMany({where:{id:{in:fixture.peers.map(peer=>peer.enrollmentId)}}});assert.equal(peers.length,fixture.peers.length);assert.ok(peers.every(peer=>peer.status==='ACTIVE'));
 const course=await db.classSection.findUniqueOrThrow({where:{id:fixture.sectionId}});assert.equal(course.status,'ACTIVE');
 const jobs=await db.$queryRaw`SELECT id,storage_key,attempts,deleted_at,finalize_after FROM v81_student_media_erasure WHERE student_id=${studentId}::uuid AND organization_id=${org.id}::uuid`;
 assert.equal(jobs.length,2);assert.ok(jobs.every(job=>job.attempts>0));
 for(const job of jobs)await assert.rejects(()=>storage.send(new HeadObjectCommand({Bucket:config.objectStorage.bucket,Key:job.storage_key})),error=>error.$metadata?.httpStatusCode===404);
 const [audit]=await db.$queryRaw`SELECT count(*)::integer n FROM v81_events WHERE resource_id=${studentId}::uuid AND organization_id=${org.id}::uuid AND event_type='ACCOUNT_AND_HISTORY_DELETED'`;assert.equal(audit.n,1);
 const complete=jobs.every(job=>job.deleted_at!==null);
 console.log(JSON.stringify({check:'CLOUD_STUDENT_DELETION_DATABASE_COS',result:complete?'PASS':'PENDING_FINAL_SWEEP',remaining,creditProjections:credit.n,peerMembershipsRetained:peers.length,courseRetained:true,cosObjectsAbsent:jobs.length,deletionAuditCount:audit.n,finalizeAfter:jobs.map(job=>job.finalize_after.toISOString())}));
}finally{await db.$disconnect();storage.destroy();}
