import { requireUnsettledCourse } from '../../v8/v81-settlement-write-guard.js';
import { appendV81SystemEvent } from '../../v8/v81-system-event.js';
import { Injectable } from '@nestjs/common';

import { AuditService, type FoundationAuditAction } from '../../../common/audit/audit.service.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { ApplicationError } from '../../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../../common/http/request-context.js';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service.js';
import { OutboxService } from '../../../common/outbox/outbox.service.js';
import { SecureDigestService } from '../../../common/security/secure-digest.service.js';
import { Clock } from '../../../common/time/clock.js';
import { IdGenerator } from '../../../common/time/id-generator.js';
import { OrganizationTimeService } from '../../../common/time/organization-time.service.js';
import { Prisma, type ExerciseSession } from '../../../generated/prisma/client.js';
import {
  assertTransition,
  cappedRunningDuration,
  SESSION_DURATION_CAP_SECONDS,
  wholeSeconds,
} from '../domain/exercise-session.js';
import type {
  CancelExerciseSessionRequestDto,
  ExerciseSessionControlRequestDto,
  ReconcileExerciseSessionRequestDto,
  StartExerciseSessionRequestDto,
} from '../interface/http/exercise-sessions.dto.js';
import {
  projectExerciseSession,
  type ExerciseSessionProjection,
} from './exercise-session-projection.js';
import { requiredCourseThreshold } from '../../v8/v81-record-state.js';

type Transaction = Prisma.TransactionClient;

interface MutationFacts {
  requestId: string;
  idempotencyKey: string | undefined;
}

type Command = 'PAUSE' | 'RESUME' | 'FINISH' | 'CANCEL';

@Injectable()
export class ExerciseSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly digest: SecureDigestService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly organizationTime: OrganizationTimeService,
  ) {}

  async completeDueSessions() {
    const now=this.clock.now();
    const due=await this.prisma.$queryRaw<{id:string;organization_id:string}[]>`
      SELECT id,organization_id FROM exercise_sessions WHERE status='IN_PROGRESS'
      AND maximum_duration_seconds IS NOT NULL AND current_interval_started_at IS NOT NULL
      AND current_interval_started_at + (maximum_duration_seconds-actual_duration_seconds)*interval '1 second' <= ${now}
      ORDER BY current_interval_started_at,id LIMIT 100`;
    for(const candidate of due)await this.serializable(async tx=>{
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${candidate.organization_id}::uuid FOR NO KEY UPDATE`;
      await tx.$queryRaw`SELECT id FROM exercise_sessions WHERE id=${candidate.id}::uuid FOR UPDATE`;
      const session=await tx.exerciseSession.findUnique({where:{id:candidate.id}});
      if(session)await this.materializeCap(tx,session,null,{requestId:this.ids.next(),idempotencyKey:undefined});
    });
    return due.length;
  }

  async start(
    principal: AuthenticatedPrincipal,
    input: StartExerciseSessionRequestDto,
    facts: MutationFacts,
  ): Promise<ExerciseSessionProjection> {
    this.assertStudent(principal);
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'startExerciseSession',
        scope: `${principal.organizationId}:${principal.userId}`,
        key: facts.idempotencyKey,
        request: input,
        requestId: facts.requestId,
      },
      async (transaction) => {
        try {
          await transaction.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
          if ((await transaction.systemPolicy.findUnique({ where: { organizationId: principal.organizationId } }))?.systemMode !== 'NORMAL')
            throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
          await transaction.$queryRaw`SELECT c.id FROM class_sections c JOIN enrollments e ON e.class_section_id=c.id
            WHERE e.id=${input.enrollmentId}::uuid AND e.organization_id=${principal.organizationId}::uuid FOR UPDATE OF c`;
          await transaction.$queryRaw`SELECT id FROM enrollments WHERE id=${input.enrollmentId}::uuid FOR UPDATE`;
          const enrollment = await transaction.enrollment.findFirst({
            where: { id: input.enrollmentId, organizationId: principal.organizationId },
            include: {
              student: { include: { user: true } },
              organization: true,
              semester: true,
              classSection: { include: { excludedDates: true } },
            },
          });
          if (enrollment?.student.userId !== principal.userId) {
            throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
          }
          await requireUnsettledCourse(transaction, principal.organizationId, enrollment.classSectionId);
          if (
            enrollment.status !== 'ACTIVE' ||
            enrollment.student.status !== 'ACTIVE' ||
            enrollment.student.deletedAt !== null
          ) {
            throw new ApplicationError('ENROLLMENT_NOT_ACTIVE', 409);
          }
          const now = this.clock.now();
          await requiredCourseThreshold(transaction, enrollment.classSectionId);
          const rules = (await transaction.$queryRaw<{ regular_deadline: Date; maximum_minutes: number; allocation_pending: boolean }[]>`
            SELECT r.regular_deadline,COALESCE(r.maximum_minutes,GREATEST(60,r.minimum_minutes)) AS maximum_minutes,
              (r.target_global_version<>COALESCE(g.version,0) OR r.course_target::bigint+r.general_target<>COALESCE(g.total_target_minutes,1200)) AS allocation_pending
            FROM v81_course_rules r LEFT JOIN v81_exercise_goal_settings g ON g.organization_id=r.organization_id
            WHERE r.class_section_id=${enrollment.classSectionId}::uuid AND r.published_at IS NOT NULL FOR SHARE OF r`)[0]!;
          if (rules.allocation_pending) throw new ApplicationError('CONFLICT_STATE_TRANSITION',409,{reason:'COURSE_TARGET_ALLOCATION_REQUIRED'});
          let makeupWindowId: string | null = null;
          if (now > rules.regular_deadline) {
            const grants = await transaction.$queryRaw<{ id: string }[]>`SELECT w.id FROM v81_makeup_windows w
              WHERE w.organization_id=${principal.organizationId}::uuid AND w.class_section_id=${enrollment.classSectionId}::uuid
                AND w.enrollment_id=${enrollment.id}::uuid AND w.created_at<=${now} AND w.starts_at<=${now} AND w.ends_at>${now}
                AND NOT EXISTS(SELECT 1 FROM v81_makeup_revocations r WHERE r.window_id=w.id)
              ORDER BY w.created_at,w.id LIMIT 1 FOR UPDATE OF w`;
            makeupWindowId = grants[0]?.id ?? null;
            if (!makeupWindowId) throw new ApplicationError('SESSION_OUTSIDE_TIME_WINDOW', 409);
          }
          const active = await transaction.exerciseSession.findFirst({
            where: {
              organizationId: principal.organizationId,
              studentId: enrollment.studentId,
              status: { in: ['IN_PROGRESS', 'PAUSED'] },
            },
          });
          if (active !== null) throw new ApplicationError('SESSION_ALREADY_ACTIVE', 409);

          const businessDate = this.assertStartWindow(enrollment, now, makeupWindowId !== null);

          const sessionId = this.ids.next();
          const session = await transaction.exerciseSession.create({
            data: {
              id: sessionId,
              organizationId: principal.organizationId,
              studentId: enrollment.studentId,
              enrollmentId: enrollment.id,
              classSectionId: enrollment.classSectionId,
              semesterId: enrollment.semesterId,
              startedByAuthSessionId: principal.sessionId,
              status: 'IN_PROGRESS',
              startedAt: now,
              businessDate: new Date(`${businessDate}T00:00:00.000Z`),
              actualDurationSeconds: 0n,
              maximumDurationSeconds: rules.maximum_minutes * 60,
              pausedDurationSeconds: 0n,
              currentIntervalStartedAt: now,
              lastHeartbeatAt: now,
              createdAt: now,
              updatedAt: now,
              version: 1,
            },
          });
          if (makeupWindowId) await transaction.$executeRaw`INSERT INTO v81_makeup_session_sources(session_id,window_id,created_at)
            VALUES(${sessionId}::uuid,${makeupWindowId}::uuid,${now})`;
          await transaction.exerciseSessionSegment.create({
            data: {
              id: this.ids.next(),
              organizationId: principal.organizationId,
              exerciseSessionId: sessionId,
              sequenceNumber: 1,
              segmentType: 'RUNNING',
              startedAt: now,
              source: 'SERVER',
              createdAt: now,
            },
          });
          await this.appendDomainEvent(transaction, session, {
            eventVersion: 1,
            eventType: 'STARTED',
            fromStatus: null,
            toStatus: 'IN_PROGRESS',
            acceptedAt: now,
            clientObservedAt: new Date(input.clientObservedAt),
            actor: principal,
            requestId: facts.requestId,
            idempotencyKey: facts.idempotencyKey,
          });
          await this.appendEvidence(transaction, session, principal, facts, {
            auditAction: 'EXERCISE_SESSION_STARTED',
            permissionId: 'EXERCISE-SESSION-START',
            previousStatus: null,
            nextStatus: 'IN_PROGRESS',
            eventType: 'EXERCISE_SESSION_STARTED_V1',
          });
          return this.idempotency.success(projectExerciseSession(session, now), {
            principalId: principal.userId,
            authSessionId: principal.sessionId,
            resourceType: 'EXERCISE_SESSION',
            resourceId: session.id,
          });
        } catch (error: unknown) {
          if (error instanceof ApplicationError) return this.idempotency.failure(error);
          throw error;
        }
      },
    );
  }

  async getActive(
    principal: AuthenticatedPrincipal,
    enrollmentId: string | undefined,
    requestId: string,
  ): Promise<ExerciseSessionProjection | null> {
    this.assertStudent(principal);
    return this.serializable(async (transaction) => {
      const studentId = await this.requiredStudentId(transaction, principal);
      const session = await transaction.exerciseSession.findFirst({
        where: {
          organizationId: principal.organizationId,
          studentId,
          status: { in: ['IN_PROGRESS', 'PAUSED'] },
          ...(enrollmentId === undefined ? {} : { enrollmentId }),
        },
      });
      if (session === null) return null;
      const materialized = await this.materializeCap(transaction, session, principal, {
        requestId,
        idempotencyKey: undefined,
      });
      return projectExerciseSession(materialized, this.clock.now());
    });
  }

  async get(
    principal: AuthenticatedPrincipal,
    sessionId: string,
    requestId: string,
  ): Promise<ExerciseSessionProjection> {
    this.assertStudent(principal);
    return this.serializable(async (transaction) => {
      const session = await this.requiredOwnedSession(transaction, principal, sessionId);
      const materialized = await this.materializeCap(transaction, session, principal, {
        requestId,
        idempotencyKey: undefined,
      });
      return projectExerciseSession(materialized, this.clock.now());
    });
  }

  pause(
    principal: AuthenticatedPrincipal,
    sessionId: string,
    input: ExerciseSessionControlRequestDto,
    facts: MutationFacts,
  ): Promise<ExerciseSessionProjection> {
    return this.command(principal, sessionId, 'PAUSE', input, facts);
  }

  resume(
    principal: AuthenticatedPrincipal,
    sessionId: string,
    input: ExerciseSessionControlRequestDto,
    facts: MutationFacts,
  ): Promise<ExerciseSessionProjection> {
    return this.command(principal, sessionId, 'RESUME', input, facts);
  }

  finish(
    principal: AuthenticatedPrincipal,
    sessionId: string,
    input: ExerciseSessionControlRequestDto,
    facts: MutationFacts,
  ): Promise<ExerciseSessionProjection> {
    return this.command(principal, sessionId, 'FINISH', input, facts);
  }

  cancel(
    principal: AuthenticatedPrincipal,
    sessionId: string,
    input: CancelExerciseSessionRequestDto,
    facts: MutationFacts,
  ): Promise<ExerciseSessionProjection> {
    return this.command(principal, sessionId, 'CANCEL', input, facts);
  }

  async reconcile(
    principal: AuthenticatedPrincipal,
    sessionId: string,
    input: ReconcileExerciseSessionRequestDto,
    facts: MutationFacts,
  ): Promise<ExerciseSessionProjection> {
    this.assertStudent(principal);
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'reconcileExerciseSession',
        scope: `${principal.organizationId}:${sessionId}`,
        key: facts.idempotencyKey,
        request: { sessionId, ...input },
        requestId: facts.requestId,
      },
      async (transaction) => {
        try {
          let session = await this.requiredOwnedSession(transaction, principal, sessionId);
          this.assertVersion(session, input.expectedVersion);
          session = await this.materializeCap(transaction, session, principal, facts);
          if (session.startedByAuthSessionId !== principal.sessionId) {
            await this.appendRejectedReconcile(transaction, session, principal, facts, 1);
            return this.idempotency.failure(
              new ApplicationError('SESSION_RECONCILIATION_REQUIRED', 409),
            );
          }
          const now = this.clock.now();
          const ids = new Set(input.clientEvents.map((event) => event.eventId));
          if (ids.size !== input.clientEvents.length) {
            throw new ApplicationError('SESSION_EVENT_OUT_OF_ORDER', 409);
          }
          const normalized = input.clientEvents.map((event) => ({
            ...event,
            observed: new Date(event.observedAt),
          }));
          for (let index = 0; index < normalized.length; index += 1) {
            const event = normalized[index]!;
            if (
              event.eventType !== 'STATE_SYNC' ||
              event.observed.getTime() > now.getTime() ||
              (index > 0 && event.observed < normalized[index - 1]!.observed)
            ) {
              await this.appendRejectedReconcile(transaction, session, principal, facts, 1);
              return this.idempotency.failure(
                event.eventType === 'STATE_SYNC'
                  ? new ApplicationError('SESSION_EVENT_OUT_OF_ORDER', 409)
                  : new ApplicationError('SESSION_RECONCILIATION_REQUIRED', 409),
              );
            }
          }
          const existing = await transaction.exerciseSessionEvent.findMany({
            where: { exerciseSessionId: session.id, clientEventId: { in: [...ids] } },
            orderBy: { eventVersion: 'asc' },
          });
          const existingById = new Map(existing.map((event) => [event.clientEventId, event]));
          let encounteredNew = false;
          const newEvents = [] as typeof normalized;
          for (const event of normalized) {
            const accepted = existingById.get(event.eventId);
            if (accepted === undefined) {
              encounteredNew = true;
              newEvents.push(event);
              continue;
            }
            if (
              encounteredNew ||
              accepted.eventType !== 'RECONCILED' ||
              accepted.actorUserId !== principal.userId ||
              accepted.authSessionId !== principal.sessionId ||
              accepted.clientObservedAt?.toISOString() !== event.observed.toISOString()
            ) {
              throw new ApplicationError('SESSION_EVENT_OUT_OF_ORDER', 409);
            }
          }
          const latestObservation = await transaction.exerciseSessionEvent.findFirst({
            where: { exerciseSessionId: session.id, clientEventId: { not: null } },
            orderBy: { eventVersion: 'desc' },
            select: { clientObservedAt: true },
          });
          if (
            newEvents[0] !== undefined &&
            latestObservation?.clientObservedAt !== null &&
            latestObservation?.clientObservedAt !== undefined &&
            newEvents[0].observed < latestObservation.clientObservedAt
          ) {
            throw new ApplicationError('SESSION_EVENT_OUT_OF_ORDER', 409);
          }
          if (newEvents.length > 0) {
            for (let index = 0; index < newEvents.length; index += 1) {
              const event = newEvents[index]!;
              await this.appendDomainEvent(transaction, session, {
                eventVersion: session.version + index + 1,
                eventType: 'RECONCILED',
                fromStatus: session.status,
                toStatus: session.status,
                acceptedAt: now,
                clientObservedAt: event.observed,
                clientEventId: event.eventId,
                actor: principal,
                requestId: facts.requestId,
                idempotencyKey: facts.idempotencyKey,
              });
            }
            const changed = await transaction.exerciseSession.updateMany({
              where: { id: session.id, version: session.version, status: session.status },
              data: {
                version: { increment: newEvents.length },
                lastHeartbeatAt: now,
                updatedAt: now,
              },
            });
            if (changed.count !== 1) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
            session = await transaction.exerciseSession.findUniqueOrThrow({
              where: { id: session.id },
            });
            await this.appendEvidence(transaction, session, principal, facts, {
              auditAction: 'EXERCISE_SESSION_RECONCILED',
              permissionId: 'EXERCISE-SESSION-RECONCILE',
              previousStatus: session.status,
              nextStatus: session.status,
              eventType: 'EXERCISE_SESSION_RECONCILED_V1',
              acceptedEventCount: newEvents.length,
            });
          }
          return this.idempotency.success(projectExerciseSession(session, now), {
            principalId: principal.userId,
            authSessionId: principal.sessionId,
            resourceType: 'EXERCISE_SESSION',
            resourceId: session.id,
          });
        } catch (error: unknown) {
          if (error instanceof ApplicationError) return this.idempotency.failure(error);
          throw error;
        }
      },
    );
  }

  private async command(
    principal: AuthenticatedPrincipal,
    sessionId: string,
    command: Command,
    input: ExerciseSessionControlRequestDto | CancelExerciseSessionRequestDto,
    facts: MutationFacts,
  ): Promise<ExerciseSessionProjection> {
    this.assertStudent(principal);
    const operationId = `${command.toLowerCase()}ExerciseSession`;
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId,
        scope: `${principal.organizationId}:${sessionId}`,
        key: facts.idempotencyKey,
        request: { sessionId, ...input },
        requestId: facts.requestId,
      },
      async (transaction) => {
        try {
          let session = await this.requiredOwnedSession(transaction, principal, sessionId);
          this.assertVersion(session, input.expectedVersion);
          session = await this.materializeCap(transaction, session, principal, facts);
          if (session.version !== input.expectedVersion) {
            if (command === 'FINISH' && session.status === 'COMPLETED') {
              return this.idempotency.success(projectExerciseSession(session, this.clock.now()), {
                principalId: principal.userId,
                authSessionId: principal.sessionId,
                resourceType: 'EXERCISE_SESSION',
                resourceId: session.id,
              });
            }
            throw new ApplicationError('SESSION_DURATION_CAP_REACHED', 409);
          }
          const now = this.clock.now();
          const expectedStatus = command === 'RESUME' ? 'PAUSED' : undefined;
          if (expectedStatus !== undefined && session.status !== expectedStatus) {
            assertTransition(session.status, 'IN_PROGRESS');
          }
          if (command === 'PAUSE') assertTransition(session.status, 'PAUSED');
          if (command === 'FINISH') assertTransition(session.status, 'COMPLETED');
          if (command === 'CANCEL') assertTransition(session.status, 'CANCELLED');

          const closed = await this.closeOpenSegment(transaction, session, now);
          let actual = Number(session.actualDurationSeconds);
          let paused = Number(session.pausedDurationSeconds);
          if (closed.segmentType === 'RUNNING') actual += closed.acceptedSeconds;
          else paused += closed.acceptedSeconds;
          if (actual > SESSION_DURATION_CAP_SECONDS) {
            throw new ApplicationError('SESSION_TIMELINE_INVALID', 409);
          }
          const nextStatus =
            command === 'PAUSE'
              ? 'PAUSED'
              : command === 'RESUME'
                ? 'IN_PROGRESS'
                : command === 'FINISH'
                  ? 'COMPLETED'
                  : 'CANCELLED';
          const nextVersion = session.version + 1;
          const changed = await transaction.exerciseSession.updateMany({
            where: { id: session.id, version: session.version, status: session.status },
            data: {
              status: nextStatus,
              actualDurationSeconds: BigInt(actual),
              pausedDurationSeconds: BigInt(paused),
              currentIntervalStartedAt:
                nextStatus === 'IN_PROGRESS' || nextStatus === 'PAUSED' ? now : null,
              completedAt: nextStatus === 'COMPLETED' ? now : null,
              cancelledAt: nextStatus === 'CANCELLED' ? now : null,
              endReason:
                nextStatus === 'COMPLETED'
                  ? 'USER_COMPLETED'
                  : nextStatus === 'CANCELLED'
                    ? 'USER_CANCELLED'
                    : null,
              lastHeartbeatAt: now,
              updatedAt: now,
              version: nextVersion,
            },
          });
          if (changed.count !== 1) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
          if (nextStatus === 'IN_PROGRESS' || nextStatus === 'PAUSED') {
            await transaction.exerciseSessionSegment.create({
              data: {
                id: this.ids.next(),
                organizationId: session.organizationId,
                exerciseSessionId: session.id,
                sequenceNumber: closed.sequenceNumber + 1,
                segmentType: nextStatus === 'IN_PROGRESS' ? 'RUNNING' : 'PAUSED',
                startedAt: now,
                source: 'SERVER',
                createdAt: now,
              },
            });
          }
          const updated = await transaction.exerciseSession.findUniqueOrThrow({
            where: { id: session.id },
          });
          await this.appendDomainEvent(transaction, updated, {
            eventVersion: nextVersion,
            eventType:
              command === 'PAUSE'
                ? 'PAUSED'
                : command === 'RESUME'
                  ? 'RESUMED'
                  : command === 'FINISH'
                    ? 'COMPLETED'
                    : 'CANCELLED',
            fromStatus: session.status,
            toStatus: nextStatus,
            acceptedAt: now,
            clientObservedAt: 'clientObservedAt' in input ? new Date(input.clientObservedAt) : null,
            actor: principal,
            requestId: facts.requestId,
            idempotencyKey: facts.idempotencyKey,
            safeMetadata:
              command === 'CANCEL' && 'reason' in input
                ? { reasonDigest: this.digest.digest('session-cancel-reason', input.reason.trim()) }
                : {},
          });
          await this.appendEvidence(transaction, updated, principal, facts, {
            auditAction:
              command === 'PAUSE'
                ? 'EXERCISE_SESSION_PAUSED'
                : command === 'RESUME'
                  ? 'EXERCISE_SESSION_RESUMED'
                  : command === 'FINISH'
                    ? 'EXERCISE_SESSION_COMPLETED'
                    : 'EXERCISE_SESSION_CANCELLED',
            permissionId: `EXERCISE-SESSION-${command}`,
            previousStatus: session.status,
            nextStatus,
            eventType: `EXERCISE_SESSION_${command === 'FINISH' ? 'COMPLETED' : command === 'CANCEL' ? 'CANCELLED' : command + 'D'}_V1`,
          });
          return this.idempotency.success(projectExerciseSession(updated, now), {
            principalId: principal.userId,
            authSessionId: principal.sessionId,
            resourceType: 'EXERCISE_SESSION',
            resourceId: session.id,
          });
        } catch (error: unknown) {
          if (error instanceof ApplicationError) return this.idempotency.failure(error);
          throw error;
        }
      },
    );
  }

  private async materializeCap(
    transaction: Transaction,
    session: ExerciseSession,
    principal: AuthenticatedPrincipal | null,
    facts: MutationFacts,
  ): Promise<ExerciseSession> {
    if (session.status !== 'IN_PROGRESS' || session.currentIntervalStartedAt === null)
      return session;
    const now = this.clock.now();
    const result = cappedRunningDuration(
      session.actualDurationSeconds,
      session.currentIntervalStartedAt,
      now,
      session.maximumDurationSeconds ?? undefined,
    );
    if (!result.reachedCap) return session;
    await this.closeOpenSegment(transaction, session, result.capAt);
    const nextVersion = session.version + 1;
    const changed = await transaction.exerciseSession.updateMany({
      where: { id: session.id, version: session.version, status: 'IN_PROGRESS' },
      data: {
        status: 'COMPLETED',
        actualDurationSeconds: BigInt(result.actualDurationSeconds),
        currentIntervalStartedAt: null,
        completedAt: result.capAt,
        endReason: 'DURATION_LIMIT_REACHED',
        lastHeartbeatAt: result.capAt,
        updatedAt: result.capAt,
        version: nextVersion,
      },
    });
    if (changed.count !== 1) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
    const updated = await transaction.exerciseSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    if(principal)await this.appendDomainEvent(transaction, updated, {
      eventVersion: nextVersion,
      eventType: 'COMPLETED',
      fromStatus: 'IN_PROGRESS',
      toStatus: 'COMPLETED',
      acceptedAt: result.capAt,
      clientObservedAt: null,
      actor: principal,
      requestId: facts.requestId,
      idempotencyKey: facts.idempotencyKey,
      safeMetadata: { endReason: 'DURATION_LIMIT_REACHED' },
    });
    else await appendV81SystemEvent(transaction,{organizationId:updated.organizationId,resourceType:'EXERCISE_SESSION',resourceId:updated.id,
      eventType:'DURATION_LIMIT_REACHED',requestId:facts.requestId,version:nextVersion,occurredAt:result.capAt,outcome:'SUCCEEDED',
      facts:{actualDurationSeconds:result.actualDurationSeconds,maximumDurationSeconds:updated.maximumDurationSeconds}});
    await this.appendEvidence(transaction, updated, principal, facts, {
      auditAction: 'EXERCISE_SESSION_COMPLETED',
      permissionId: 'EXERCISE-SESSION-DURATION-CAP',
      previousStatus: 'IN_PROGRESS',
      nextStatus: 'COMPLETED',
      eventType: 'EXERCISE_SESSION_COMPLETED_V1',
    });
    return updated;
  }

  private async closeOpenSegment(
    transaction: Transaction,
    session: ExerciseSession,
    endedAt: Date,
  ): Promise<{ segmentType: string; acceptedSeconds: number; sequenceNumber: number }> {
    const segment = await transaction.exerciseSessionSegment.findFirst({
      where: {
        exerciseSessionId: session.id,
        organizationId: session.organizationId,
        endedAt: null,
      },
    });
    if (segment === null || session.currentIntervalStartedAt === null) {
      throw new ApplicationError('SESSION_TIMELINE_INVALID', 409);
    }
    const expectedType = session.status === 'IN_PROGRESS' ? 'RUNNING' : 'PAUSED';
    if (
      segment.segmentType !== expectedType ||
      segment.startedAt.getTime() !== session.currentIntervalStartedAt.getTime()
    ) {
      throw new ApplicationError('SESSION_TIMELINE_INVALID', 409);
    }
    const acceptedSeconds = wholeSeconds(segment.startedAt, endedAt);
    const changed = await transaction.exerciseSessionSegment.updateMany({
      where: { id: segment.id, endedAt: null },
      data: { endedAt, acceptedDurationSeconds: BigInt(acceptedSeconds) },
    });
    if (changed.count !== 1) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
    return {
      segmentType: segment.segmentType,
      acceptedSeconds,
      sequenceNumber: segment.sequenceNumber,
    };
  }

  private async requiredOwnedSession(
    transaction: Transaction,
    principal: AuthenticatedPrincipal,
    sessionId: string,
  ): Promise<ExerciseSession> {
    const session = await transaction.exerciseSession.findFirst({
      where: {
        id: sessionId,
        organizationId: principal.organizationId,
        student: { userId: principal.userId },
      },
    });
    if (session === null) throw new ApplicationError('SESSION_NOT_FOUND', 404);
    return session;
  }

  private async requiredStudentId(
    transaction: Transaction,
    principal: AuthenticatedPrincipal,
  ): Promise<string> {
    const student = await transaction.studentProfile.findFirst({
      where: {
        organizationId: principal.organizationId,
        userId: principal.userId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true },
    });
    if (student === null) throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    return student.id;
  }

  private assertStartWindow(
    enrollment: {
      organization: { timezone: string };
      semester: { status: string; startDate: Date; endDate: Date };
      classSection: {
        status: string;
        checkInWindowMode: string;
        checkInStartDate: Date | null;
        checkInEndDate: Date | null;
        dailyStartTime: Date | null;
        dailyEndTime: Date | null;
        submissionDeadlineAt: Date | null;
        excludedDates: { excludedDate: Date }[];
      };
    },
    now: Date,
    makeupAuthorized = false,
  ): string {
    const { classSection, semester, organization } = enrollment;
    const businessDate = this.organizationTime.businessDate(now, organization.timezone);
    const semesterStart = semester.startDate.toISOString().slice(0, 10);
    const semesterEnd = semester.endDate.toISOString().slice(0, 10);
    const checkInStart = classSection.checkInStartDate?.toISOString().slice(0, 10);
    const checkInEnd = classSection.checkInEndDate?.toISOString().slice(0, 10);
    if (
      classSection.status !== 'ACTIVE' ||
      semester.status !== 'CURRENT' ||
      businessDate < semesterStart ||
      businessDate > semesterEnd
    ) {
      throw new ApplicationError('SESSION_OUTSIDE_TIME_WINDOW', 409);
    }
    if (!makeupAuthorized && (
      classSection.checkInWindowMode !== 'AVAILABLE' ||
      checkInStart === undefined ||
      checkInEnd === undefined ||
      businessDate < checkInStart ||
      businessDate > checkInEnd ||
      (classSection.submissionDeadlineAt !== null && now > classSection.submissionDeadlineAt) ||
      classSection.excludedDates.some(
        (entry) => entry.excludedDate.toISOString().slice(0, 10) === businessDate,
      )
    )) {
      throw new ApplicationError('SESSION_OUTSIDE_TIME_WINDOW', 409);
    }
    if (!makeupAuthorized && classSection.dailyStartTime !== null && classSection.dailyEndTime !== null) {
      const localTime = this.localTime(now, organization.timezone);
      const dailyStart = classSection.dailyStartTime.toISOString().slice(11, 19);
      const dailyEnd = classSection.dailyEndTime.toISOString().slice(11, 19);
      if (localTime < dailyStart || localTime > dailyEnd) {
        throw new ApplicationError('SESSION_OUTSIDE_TIME_WINDOW', 409);
      }
    }
    return businessDate;
  }

  private localTime(at: Date, timezone: string): string {
    const values = new Map(
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(at)
        .map((part) => [part.type, part.value]),
    );
    return `${values.get('hour')}:${values.get('minute')}:${values.get('second')}`;
  }

  private async appendDomainEvent(
    transaction: Transaction,
    session: ExerciseSession,
    input: {
      eventVersion: number;
      eventType: string;
      fromStatus: string | null;
      toStatus: string;
      acceptedAt: Date;
      clientObservedAt: Date | null;
      clientEventId?: string;
      actor: AuthenticatedPrincipal;
      requestId: string;
      idempotencyKey: string | undefined;
      safeMetadata?: Record<string, string>;
    },
  ): Promise<void> {
    await transaction.exerciseSessionEvent.create({
      data: {
        id: this.ids.next(),
        organizationId: session.organizationId,
        exerciseSessionId: session.id,
        eventVersion: input.eventVersion,
        eventType: input.eventType,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        acceptedAt: input.acceptedAt,
        clientObservedAt: input.clientObservedAt,
        clientEventId: input.clientEventId ?? null,
        actorUserId: input.actor.userId,
        authSessionId: input.actor.sessionId,
        requestId: input.requestId,
        idempotencyKeyReference: this.keyReference(input.idempotencyKey),
        safeMetadata: input.safeMetadata ?? {},
        createdAt: input.acceptedAt,
      },
    });
  }

  private async appendEvidence(
    transaction: Transaction,
    session: ExerciseSession,
    principal: AuthenticatedPrincipal | null,
    facts: MutationFacts,
    input: {
      auditAction: FoundationAuditAction;
      permissionId: string;
      previousStatus: string | null;
      nextStatus: string;
      eventType: string;
      acceptedEventCount?: number;
    },
  ): Promise<void> {
    const safeMetadata: Record<string, unknown> = {
      classSectionId: session.classSectionId,
      ...(input.previousStatus === null ? {} : { previousStatus: input.previousStatus }),
      nextStatus: input.nextStatus,
      ...(input.auditAction === 'EXERCISE_SESSION_RECONCILED'
        ? { acceptedEventCount: input.acceptedEventCount ?? 0, rejectedEventCount: 0 }
        : {
            actualDurationSeconds: Number(session.actualDurationSeconds),
            pausedDurationSeconds: Number(session.pausedDurationSeconds),
          }),
      ...(session.endReason === null || input.auditAction === 'EXERCISE_SESSION_RECONCILED'
        ? {} : { endReason: session.endReason }),
    };
    await this.audit.append(transaction, {
      organizationId: session.organizationId,
      actorUserId: principal?.userId ?? null,
      actorRoleSnapshot: principal?.role ?? null,
      permissionId: input.permissionId,
      actionType: input.auditAction,
      targetType: 'EXERCISE_SESSION',
      targetId: session.id,
      requestId: facts.requestId,
      idempotencyKeyReference: this.keyReference(facts.idempotencyKey),
      outcome: 'SUCCEEDED',
      safeMetadata,
    });
    await this.outbox.append(transaction, {
      organizationId: session.organizationId,
      aggregateType: 'EXERCISE_SESSION',
      aggregateId: session.id,
      eventType: input.eventType,
      eventVersion: session.version,
      payload: {
        sessionId: session.id,
        enrollmentId: session.enrollmentId,
        classSectionId: session.classSectionId,
        status: session.status,
        version: session.version,
        requestId: facts.requestId,
      },
    });
  }

  private async appendRejectedReconcile(
    transaction: Transaction,
    session: ExerciseSession,
    principal: AuthenticatedPrincipal,
    facts: MutationFacts,
    rejectedEventCount: number,
  ): Promise<void> {
    await this.audit.append(transaction, {
      organizationId: session.organizationId,
      actorUserId: principal.userId,
      actorRoleSnapshot: principal.role,
      permissionId: 'EXERCISE-SESSION-RECONCILE',
      actionType: 'EXERCISE_SESSION_RECONCILED',
      targetType: 'EXERCISE_SESSION',
      targetId: session.id,
      requestId: facts.requestId,
      idempotencyKeyReference: this.keyReference(facts.idempotencyKey),
      outcome: 'REJECTED',
      reasonCode: 'SESSION_RECONCILIATION_REQUIRED',
      safeMetadata: {
        classSectionId: session.classSectionId,
        previousStatus: session.status,
        nextStatus: session.status,
        acceptedEventCount: 0,
        rejectedEventCount,
      },
    });
    await this.outbox.append(transaction, {
      organizationId: session.organizationId,
      aggregateType: 'EXERCISE_SESSION',
      aggregateId: session.id,
      eventType: 'EXERCISE_SESSION_RECONCILIATION_REQUIRED_V1',
      eventVersion: session.version,
      payload: {
        sessionId: session.id,
        status: session.status,
        requestId: facts.requestId,
      },
    });
  }

  private assertVersion(session: ExerciseSession, expectedVersion: number): void {
    if (session.version !== expectedVersion) {
      throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409, {
        expectedVersion,
        currentVersion: session.version,
      });
    }
  }

  private assertStudent(principal: AuthenticatedPrincipal): void {
    if (principal.role !== 'STUDENT') {
      throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    }
  }

  private keyReference(key: string | undefined): string | null {
    return key === undefined ? null : this.digest.digest('idempotency-key-reference', key);
  }

  private async serializable<T>(action: (transaction: Transaction) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(action, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        return this.prisma.$transaction(action, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      }
      throw error;
    }
  }
}
