import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {EnrollmentsService} from '../../backend/src/modules/enrollments/application/enrollments.service.ts';
import {PrismaEnrollmentRepository} from '../../backend/src/modules/enrollments/infrastructure/prisma-enrollment.repository.ts';
import {PrismaCourseInviteRepository} from '../../backend/src/modules/course-invites/infrastructure/prisma-course-invite.repository.ts';
import {CourseInvitesService} from '../../backend/src/modules/course-invites/application/course-invites.service.ts';
import {V81RosterBasisService} from '../../backend/src/modules/v8/v81-roster-basis.ts';
import {RosterAlignmentService} from '../../backend/src/modules/roster/application/roster-alignment.service.ts';
import {V81PhysicalImportsService} from '../../backend/src/modules/v8/v81-physical-imports.ts';

export async function probeSettledMembership({tx,prisma,principal,classId,outside,clock,confirmedRosterId}) {
  const idempotency={execute:async(_input,work)=>work(tx),success:value=>value,failure:error=>{throw error}};
  const invites=new PrismaCourseInviteRepository(prisma), repository=new PrismaEnrollmentRepository(prisma);
  const membership=new EnrollmentsService(repository,invites,idempotency,{}, {}, {}, {},clock,{next:randomUUID});
  const inviteService=new CourseInvitesService(invites,idempotency,{}, {}, {}, {},clock,{next:randomUUID},{});
  const basis=new V81RosterBasisService(prisma,idempotency,clock,{next:randomUUID});
  const facts={requestId:randomUUID(),idempotencyKey:randomUUID()};
  const blocked={code:'CONFLICT_STATE_TRANSITION',details:{reason:'SETTLED_FACT_CORRECTION_REQUIRED'}};
  const before=await tx.enrollment.findUniqueOrThrow({where:{id:outside.enrollmentId}});
  const inviteCount=await tx.courseInvite.count({where:{classSectionId:classId}});
  await assert.rejects(membership.manuallyEnroll(principal,classId,
    {studentId:before.studentId,reason:'Synthetic settled membership test'},facts),blocked);
  for(const method of ['remove','restore']) await assert.rejects(membership[method](principal,
    {enrollmentId:outside.enrollmentId},{expectedVersion:before.version,reason:'Synthetic settled membership test'},facts),blocked);
  await assert.rejects(inviteService.createOrRotate(principal,classId,{},facts),blocked);
  await assert.rejects(basis.select(principal,classId,{expectedVersion:1,confirmedRosterId},facts.requestId,facts.idempotencyKey),blocked);
  const roster=await tx.officialRosterImport.findFirstOrThrow({where:{classSectionId:classId,isCurrent:true}});
  const alignment=new RosterAlignmentService(prisma,idempotency,{}, {}, {}, {},clock,{next:randomUUID});
  await assert.rejects(alignment.align(principal,roster.id,{expectedRosterImportVersion:roster.version},facts),blocked);
  const physical=new V81PhysicalImportsService(prisma,idempotency,clock,{next:randomUUID},{},{});
  const csv='学号,姓名,项目,用时,测试日期\n000123,Synthetic,1000m,4:30,2026-09-07';
  const [batchesBefore]=await tx.$queryRaw`SELECT count(*) AS count FROM v81_physical_import_batches WHERE class_section_id=${classId}::uuid`;
  await assert.rejects(physical.create(principal,classId,csv,facts.requestId,facts.idempotencyKey),blocked);
  const [batchesAfter]=await tx.$queryRaw`SELECT count(*) AS count FROM v81_physical_import_batches WHERE class_section_id=${classId}::uuid`;
  assert.equal(batchesAfter.count,batchesBefore.count);
  console.log(JSON.stringify({check:'SETTLED_ALIGNMENT_AND_PHYSICAL_BATCH_INTAKE_REJECTED_NO_NEW_BATCH',result:'PASS'}));
  const after=await tx.enrollment.findUniqueOrThrow({where:{id:outside.enrollmentId}});
  assert.equal(after.status,before.status);assert.equal(after.version,before.version);
  assert.equal(await tx.courseInvite.count({where:{classSectionId:classId}}),inviteCount);
  console.log(JSON.stringify({check:'SETTLED_MANUAL_ENROLL_REMOVE_RESTORE_INVITE_ROSTER_BASIS_REJECTED_MEMBERSHIP_UNCHANGED',result:'PASS',boundary:'real services and repositories; transaction adapter; rolled back'}));
}
