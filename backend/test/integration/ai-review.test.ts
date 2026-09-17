import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { v7 as uuidv7 } from 'uuid';
import { createTestPrisma, resetFoundationDatabase, seedFoundationFixture } from '../helpers/database.js';
import { seedSubmittedExerciseRecord } from '../helpers/exercise-review.js';
import { requireTestDatabaseUrl } from '../helpers/test-environment.js';
import { appendMaterialVersion } from '../../src/modules/v8/v81-materials.js';
import { applyAiDecision } from '../../src/modules/v8/v81-ai-decision.js';
import { initializeRecordWorkflow } from '../../src/modules/v8/v81-record-state.js';
import { readAiReviews, enqueueAiReview } from '../../src/modules/v8/v81-ai-review-store.js';
import type { PrismaService } from '../../src/common/database/prisma.service.js';
import type { RuntimeConfig } from '../../src/common/config/environment.js';
import type { MediaStoragePort } from '../../src/common/object-storage/media-storage.port.js';
import type { V81AiReviewWorker as AiWorkerClass } from '../../src/modules/v8/v81-ai-review.worker.js';
import type { AiReviewProvider } from '../../src/modules/v8/ai-review-provider.js';

test('default valid submission, AI exceptions, teacher precedence, retry, lease and budget', async () => {
  const prisma = createTestPrisma(requireTestDatabaseUrl());
  const { V81AiReviewWorker } = await import(pathToFileURL(resolve('dist/modules/v8/v81-ai-review.worker.js')).href) as { V81AiReviewWorker: typeof AiWorkerClass };
  try {
    await resetFoundationDatabase(prisma);
    await prisma.$executeRaw`UPDATE v81_ai_review_budget SET reserved_fen=0 WHERE id=1`;
    const fixture = await seedFoundationFixture(prisma);
    const templateId=uuidv7();
    await prisma.$executeRaw`INSERT INTO v81_admin_access(user_id,organization_id,kind,must_change_password) VALUES(${fixture.adminUserId}::uuid,${fixture.organizationId}::uuid,'SUPER',false)`;
    await prisma.$executeRaw`INSERT INTO v81_rule_templates(id,organization_id,version,display_name,rules,actor_id,request_id,published_at) VALUES(${templateId}::uuid,${fixture.organizationId}::uuid,1,'Synthetic AI rules','{"ruleSet":"V8_1","totalTargetMinutes":1200,"minimumMinutesOptions":[30,45,60],"defaultMinimumMinutes":30,"weeklyLimitOptions":[2,3,4],"defaultWeeklyLimit":3,"maximumCreditedMinutes":60,"dailyLimit":1,"creditedUnit":"WHOLE_MINUTE","supplementHours":24,"specialSupplementHours":72,"closingDays":7}'::jsonb,${fixture.adminUserId}::uuid,${uuidv7()},now())`;
    await prisma.$executeRaw`INSERT INTO v81_course_rules(class_section_id,organization_id,minimum_minutes,weekly_limit,course_target,general_target,regular_deadline,closing_deadline,settlement_planned_at,published_at,template_id) VALUES(${fixture.teacherAActiveSectionId}::uuid,${fixture.organizationId}::uuid,30,4,600,600,'2027-01-23','2027-01-30','2027-02-01',now(),${templateId}::uuid)`;
    const bytes = await sharp({create:{width:64,height:64,channels:3,background:'white'}}).png().toBuffer();
    const sha = createHash('sha256').update(bytes).digest('hex');
    const storage = { getPrivateObject: () => Promise.resolve(Readable.from([bytes])) } as unknown as MediaStoragePort;
    let calls = 0; let fail = false;
    const provider: AiReviewProvider = { enabled:true,provider:'TEST',model:'SYNTHETIC',assess:()=>{
      calls++; if (fail) return Promise.reject(new Error('AI_PROVIDER_TIMEOUT'));
      return Promise.resolve({contentSafety:'SAFE',exercise:'YES',sportMatch:'YES',confidence:0.99});
    }};
    const config = {aiReview:{enabled:true,budgetFen:500000}} as RuntimeConfig;
    const worker = () => new V81AiReviewWorker(prisma as PrismaService,config,provider,storage);
    async function seed(suffix: string, historical = false) {
      const record = await seedSubmittedExerciseRecord(prisma, fixture, suffix, 'PENDING', {actualSeconds:3600,maximumSeconds:null,configureCourse:false});
      const mediaId = uuidv7(), now = new Date();
      await prisma.mediaEvidence.create({data:{id:mediaId,organizationId:fixture.organizationId,ownerStudentId:record.studentId,
        sessionId:record.sessionId,initiatedByUserId:record.studentUserId,businessPurpose:'EXERCISE_RECORD',mediaType:'IMAGE',
        captureSource:'IN_APP_CAMERA',declaredMimeType:'image/png',verifiedMimeType:'image/png',declaredFileSizeBytes:BigInt(bytes.length),
        verifiedFileSizeBytes:BigInt(bytes.length),declaredContentSha256:sha,verifiedContentSha256:sha,uploadStatus:'AVAILABLE',
        storageKey:`media/${fixture.organizationId}/${mediaId}/image`,uploadedAt:now,boundAt:now,processingStartedAt:now,availableAt:now,createdAt:now,updatedAt:now,version:5}});
      await prisma.$transaction(async tx => {
        if(historical) await tx.$executeRaw`INSERT INTO v81_history_session_sources(session_id,settings_version,earliest_date,latest_date,declared_at,request_id) VALUES(${record.sessionId}::uuid,1,'2026-01-01','2026-12-31',${now},${uuidv7()})`;
        await initializeRecordWorkflow(tx,{recordId:record.recordId,organizationId:fixture.organizationId,mediaIds:[mediaId],now});
      });
      return {...record,mediaId};
    }
    const first = await seed('AI-FIRST');
    assert.equal((await prisma.v81RecordWorkflow.findUniqueOrThrow({where:{recordId:first.recordId}})).stage,'VALID');
    assert.equal((await prisma.$queryRaw<{credited_minutes:number}[]>`SELECT credited_minutes FROM v81_credit_projections WHERE record_id=${first.recordId}::uuid`)[0]?.credited_minutes,60);
    const before = await prisma.exerciseRecord.findUniqueOrThrow({where:{id:first.recordId}});
    const results = await Promise.all([worker().processOne(),worker().processOne()]);
    assert.equal(results.filter(Boolean).length,1); assert.equal(calls,1);
    assert.equal((await readAiReviews(prisma,[first.recordId])).get(first.recordId)?.recommendation,'SUGGEST_PASS');
    assert.equal((await prisma.exerciseRecord.findUniqueOrThrow({where:{id:first.recordId}})).version,before.version);
    assert.equal((await prisma.v81RecordWorkflow.findUniqueOrThrow({where:{recordId:first.recordId}})).stage,'VALID');
    assert.equal((await readAiReviews(prisma,[first.recordId])).get(first.recordId)?.policyVersion,'default-valid-exceptions-v3');
    const finalReview=await prisma.reviewRecord.findFirstOrThrow({where:{recordId:first.recordId},orderBy:{reviewVersion:'desc'}});
    assert.equal(finalReview.result,'VALID'); assert.equal(finalReview.teacherId,null);
    assert.equal((await prisma.$queryRaw<{credited_minutes:number}[]>`SELECT credited_minutes FROM v81_credit_projections WHERE record_id=${first.recordId}::uuid`)[0]?.credited_minutes,60);
    assert.equal(await worker().processOne(),null);
    const second = await seed('AI-DUPLICATE');
    await worker().processOne();
    assert.ok((await readAiReviews(prisma,[second.recordId])).get(second.recordId)?.flags.includes('EXACT_DUPLICATE'));
    assert.equal((await prisma.v81RecordWorkflow.findUniqueOrThrow({where:{recordId:second.recordId}})).stage,'PENDING_TEACHER');
    const pendingReview=await prisma.reviewRecord.findFirstOrThrow({where:{recordId:second.recordId},orderBy:{reviewVersion:'desc'}});
    await assert.rejects(prisma.reviewRecord.create({data:{id:uuidv7(),organizationId:fixture.organizationId,recordId:second.recordId,
      reviewVersion:pendingReview.reviewVersion+1,previousReviewId:pendingReview.id,result:'INVALID',reasonCode:'SESSION_MISMATCH',reviewedAt:new Date(),createdAt:new Date()}}),
      /AI system rejection requires/);
    const commitDecision = (recordId:string) => prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${fixture.organizationId}::uuid FOR NO KEY UPDATE`;
      const jobs=await tx.$queryRaw<{id:string}[]>`SELECT id FROM v81_ai_review_jobs WHERE record_id=${recordId}::uuid AND material_version=1`;
      await applyAiDecision(tx,{organizationId:fixture.organizationId,recordId,materialVersion:1,jobId:jobs[0]!.id,decision:'PENDING_TEACHER',policyVersion:'default-valid-exceptions-v3'});
    });
    assert.equal((await prisma.$queryRaw<{credited_minutes:number}[]>`SELECT credited_minutes FROM v81_credit_projections WHERE record_id=${second.recordId}::uuid`)[0]?.credited_minutes,0);
    const reviewCount=await prisma.reviewRecord.count({where:{recordId:second.recordId}});
    await commitDecision(second.recordId);
    assert.equal(await prisma.reviewRecord.count({where:{recordId:second.recordId}}),reviewCount);
    const third = await seed('AI-RETRY'); fail = true;
    for (let attempt=1;attempt<=3;attempt++) {
      const result = await worker().processOne(); assert.equal(result?.status,attempt===3?'FAILED':'QUEUED');
      await prisma.$executeRaw`UPDATE v81_ai_review_jobs SET next_attempt_at=now() WHERE record_id=${third.recordId}::uuid`;
    }
    assert.equal((await readAiReviews(prisma,[third.recordId])).get(third.recordId)?.recommendation,null);
    assert.equal((await prisma.v81RecordWorkflow.findUniqueOrThrow({where:{recordId:third.recordId}})).stage,'VALID');
    fail = false;
    await prisma.$transaction(async tx => {
      await appendMaterialVersion(tx,{recordId:third.recordId,organizationId:fixture.organizationId,mediaIds:[third.mediaId],materialVersion:2,now:new Date()});
      await tx.$executeRaw`UPDATE v81_record_workflows SET material_version=2,stage='PENDING_TEACHER' WHERE record_id=${third.recordId}::uuid`;
    });
    assert.equal((await readAiReviews(prisma,[third.recordId])).get(third.recordId)?.materialVersion,2);
    await worker().processOne();
    assert.equal((await prisma.v81RecordWorkflow.findUniqueOrThrow({where:{recordId:third.recordId}})).stage,'PENDING_TEACHER');
    const fourth=await seed('AI-LEASE');
    await prisma.$executeRaw`UPDATE v81_ai_review_jobs SET status='RUNNING',attempts=3,lease_owner=${uuidv7()}::uuid,lease_until=now()-interval '1 second' WHERE record_id=${fourth.recordId}::uuid`;
    await worker().processOne();
    assert.equal((await readAiReviews(prisma,[fourth.recordId])).get(fourth.recordId)?.status,'FAILED');
    const fifth=await seed('AI-BUDGET'); const callsBefore=calls;
    await prisma.$executeRaw`UPDATE v81_ai_review_budget SET reserved_fen=500000 WHERE id=1`;
    await worker().processOne(); assert.equal(calls,callsBefore);
    assert.equal((await readAiReviews(prisma,[fifth.recordId])).get(fifth.recordId)?.errorCode,'AI_BUDGET_LIMIT');
    await prisma.$executeRaw`UPDATE v81_ai_review_budget SET reserved_fen=0 WHERE id=1`;
    const completed=await seed('AI-DONE');
    const previous=await prisma.reviewRecord.findFirstOrThrow({where:{recordId:completed.recordId},orderBy:{reviewVersion:'desc'}});
    await prisma.reviewRecord.create({data:{id:uuidv7(),organizationId:fixture.organizationId,recordId:completed.recordId,
      reviewVersion:previous.reviewVersion+1,previousReviewId:previous.id,teacherId:fixture.teacherProfileId,result:'VALID',reviewedAt:new Date(),createdAt:new Date()}});
    await commitDecision(completed.recordId);
    assert.equal((await prisma.v81RecordWorkflow.findUniqueOrThrow({where:{recordId:completed.recordId}})).stage,'VALID');
    const teacherCalls=calls; await worker().processOne(); assert.equal(calls,teacherCalls);
    const historical=await seed('HISTORY',true);
    assert.equal((await prisma.v81RecordWorkflow.findUniqueOrThrow({where:{recordId:historical.recordId}})).stage,'PENDING_TEACHER');
    await worker().processOne();
    assert.equal((await prisma.v81RecordWorkflow.findUniqueOrThrow({where:{recordId:historical.recordId}})).stage,'PENDING_TEACHER');
  } finally { await prisma.$disconnect(); }
});
