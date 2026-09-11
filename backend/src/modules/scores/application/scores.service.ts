import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { ApplicationError } from '../../../common/errors/application-error.js';
import { pagedResult, type PagedResult } from '../../../common/http/envelope.interceptor.js';
import type { AuthenticatedPrincipal } from '../../../common/http/request-context.js';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service.js';
import { OutboxService } from '../../../common/outbox/outbox.service.js';
import { ScopedCursorService } from '../../../common/pagination/scoped-cursor.service.js';
import { SecureDigestService } from '../../../common/security/secure-digest.service.js';
import { Clock } from '../../../common/time/clock.js';
import { IdGenerator } from '../../../common/time/id-generator.js';
import { Prisma, type StudentScore } from '../../../generated/prisma/client.js';
import type {
  CreateScoreAdjustmentRequestDto,
  CreateScoreRuleRequestDto,
  ExpectedVersionRequestDto,
  ScoreAdjustmentListQueryDto,
  ScoreApprovalRequestDto,
  ScoreListQueryDto,
  ScoreRuleListQueryDto,
  VersionedReasonRequestDto,
} from '../interface/http/scores.dto.js';
import { applyApprovedAdjustments, calculateScore } from '../domain/score-calculation.js';
import { isSafeScoreEvidenceReference } from '../domain/score-evidence.js';
import {
  projectScoreAdjustment,
  projectScoreRule,
  projectStudentScore,
} from './score-projection.js';
import { loadValidScoreSources, totalValidCreditedSeconds } from './score-source.js';

type Transaction = Prisma.TransactionClient;
interface MutationFacts {
  requestId: string;
  idempotencyKey: string | undefined;
}

const ruleInclude = {
  approvalEvents: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
};
const revisionInclude = { contributions: true };
const scoreInclude = {
  currentWorkingRevision: { include: revisionInclude },
  publishedRevision: { include: revisionInclude },
  publicationEvents: {
    where: { action: 'PUBLISH' },
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    take: 1,
  },
};
const authorizedScoreInclude = {
  ...scoreInclude,
  classSection: { include: { teacher: true } },
  student: true,
};
const adjustmentInclude = {
  approvalEvents: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
};

export function studentScoreStatusWhere(
  status: string | undefined,
  publishedRevision: Prisma.StudentScoreFieldRefs['publishedRevisionId'],
): Prisma.StudentScoreWhereInput {
  if (status === undefined) return {};
  switch (status) {
    case 'NOT_CALCULATED':
      return { currentWorkingRevisionId: null };
    case 'CALCULATED':
    case 'ADJUSTED':
      return {
        currentWorkingRevision: { status },
        OR: [
          { publishedRevisionId: null },
          { NOT: { currentWorkingRevisionId: { equals: publishedRevision } } },
        ],
      };
    case 'PUBLISHED':
      return {
        publishedRevisionId: { not: null },
        currentWorkingRevisionId: { equals: publishedRevision },
      };
    case 'LOCKED':
      return { id: { in: [] } };
    default:
      throw new ApplicationError('VALIDATION_ENUM_UNSUPPORTED', 422);
  }
}

@Injectable()
export class ScoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly digest: SecureDigestService,
    private readonly cursors: ScopedCursorService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async listRules(
    principal: AuthenticatedPrincipal,
    classSectionId: string,
    input: ScoreRuleListQueryDto,
  ): Promise<PagedResult<Record<string, unknown>>> {
    await this.assertClassSectionReadScope(this.prisma, principal, classSectionId);
    const binding = {
      resource: 'SCORE_RULE' as const,
      organizationId: principal.organizationId,
      principalId: principal.userId,
      role: principal.role,
      filters: { classSectionId, status: input.status ?? null },
      sort: '-ruleVersion',
      limit: input.limit,
    };
    const position = this.cursors.decode(input.cursor, binding);
    const ruleVersion = position === null ? null : Number.parseInt(position.value, 10);
    if (position !== null && !Number.isSafeInteger(ruleVersion)) this.invalidCursor();
    const rows = await this.prisma.scoreRule.findMany({
      where: {
        organizationId: principal.organizationId,
        classSectionId,
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(position === null
          ? {}
          : {
              OR: [
                { ruleVersion: { lt: ruleVersion! } },
                { ruleVersion: ruleVersion!, id: { lt: position.id } },
              ],
            }),
      },
      include: ruleInclude,
      orderBy: [{ ruleVersion: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });
    const page = rows.slice(0, input.limit);
    const last = page.at(-1);
    return pagedResult(page.map(projectScoreRule), {
      hasMore: rows.length > input.limit,
      limit: input.limit,
      nextCursor:
        rows.length > input.limit && last !== undefined
          ? this.cursors.encode(binding, { value: String(last.ruleVersion), id: last.id })
          : null,
    });
  }

  createRule(
    principal: AuthenticatedPrincipal,
    classSectionId: string,
    input: CreateScoreRuleRequestDto,
    facts: MutationFacts,
  ): Promise<Record<string, unknown>> {
    return this.mutate(principal, 'createScoreRule', classSectionId, input, facts, async (tx) => {
      const section = await tx.classSection.findFirst({
        where: { id: classSectionId, organizationId: principal.organizationId },
      });
      if (section === null) throw new ApplicationError('COURSE_CLASS_SECTION_NOT_FOUND', 404);
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM class_sections WHERE id = ${classSectionId}::uuid FOR UPDATE`,
      );
      const aggregate = await tx.scoreRule.aggregate({
        where: { classSectionId },
        _max: { ruleVersion: true },
      });
      const now = this.clock.now();
      const rule = await tx.scoreRule.create({
        data: {
          id: this.ids.next(),
          organizationId: principal.organizationId,
          classSectionId,
          semesterId: section.semesterId,
          ruleCode: input.ruleCode,
          ruleVersion: (aggregate._max.ruleVersion ?? 0) + 1,
          displayName: input.displayName,
          totalRequiredSeconds: 72_000n,
          calculationDefinition: {
            formulaType: 'LINEAR_CAPPED',
            maximumScore: 100,
            categoryAllocationMode: 'TOTAL_ONLY',
          },
          roundingMode: 'HALF_UP',
          roundingScale: 2,
          status: 'DRAFT',
          createdBy: principal.userId,
          createdAt: now,
          updatedAt: now,
        },
        include: ruleInclude,
      });
      await this.appendEvidence(
        tx,
        principal,
        facts,
        'SCORE_RULE_CHANGED',
        'SCORE-RULE-CREATE',
        'SCORE_RULE',
        rule.id,
        rule.version,
        { classSectionId, status: 'DRAFT' },
      );
      return projectScoreRule(rule);
    });
  }

  async getRule(
    principal: AuthenticatedPrincipal,
    scoreRuleId: string,
  ): Promise<Record<string, unknown>> {
    const rule = await this.prisma.scoreRule.findFirst({
      where: { id: scoreRuleId, organizationId: principal.organizationId },
      include: { ...ruleInclude, classSection: { include: { teacher: true } } },
    });
    if (
      rule === null ||
      (principal.role === 'TEACHER' && rule.classSection.teacher.userId !== principal.userId)
    ) {
      throw new ApplicationError('SCORE_RULE_NOT_FOUND', 404);
    }
    return projectScoreRule(rule);
  }

  submitRule(
    principal: AuthenticatedPrincipal,
    id: string,
    input: ExpectedVersionRequestDto,
    facts: MutationFacts,
  ): Promise<Record<string, unknown>> {
    return this.ruleMutation(
      principal,
      'submitScoreRuleForApproval',
      id,
      input,
      facts,
      'SCORE-RULE-SUBMIT-APPROVAL',
      async (tx, rule) => {
        if (rule.status !== 'DRAFT') throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
        return tx.scoreRule.update({
          where: { id: rule.id, version: input.expectedVersion },
          data: {
            status: 'PENDING_APPROVAL',
            submittedAt: this.clock.now(),
            updatedAt: this.clock.now(),
            version: { increment: 1 },
          },
          include: ruleInclude,
        });
      },
    );
  }

  approveRule(
    principal: AuthenticatedPrincipal,
    id: string,
    input: ScoreApprovalRequestDto,
    facts: MutationFacts,
  ): Promise<Record<string, unknown>> {
    return this.ruleMutation(
      principal,
      'approveScoreRule',
      id,
      input,
      facts,
      'SCORE-RULE-APPROVE',
      async (tx, rule) => {
        if (rule.status !== 'PENDING_APPROVAL')
          throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
        await this.assertActiveAdmin(tx, principal);
        if (rule.createdBy === principal.userId)
          throw new ApplicationError('SCORE_RULE_SELF_APPROVAL_NOT_ALLOWED', 409);
        const prior = await tx.scoreRuleApprovalEvent.findFirst({
          where: { scoreRuleId: id, actorUserId: principal.userId, action: 'APPROVE' },
        });
        if (prior !== null)
          throw new ApplicationError('SCORE_RULE_DISTINCT_APPROVER_REQUIRED', 409);
        const now = this.clock.now();
        await tx.scoreRuleApprovalEvent.create({
          data: {
            id: this.ids.next(),
            organizationId: principal.organizationId,
            scoreRuleId: id,
            action: 'APPROVE',
            actorUserId: principal.userId,
            reason: input.reason ?? null,
            requestId: facts.requestId,
            createdAt: now,
          },
        });
        const approvals = await tx.scoreRuleApprovalEvent.count({
          where: { scoreRuleId: id, action: 'APPROVE' },
        });
        if (approvals < 2) {
          return tx.scoreRule.update({
            where: { id, version: input.expectedVersion },
            data: { updatedAt: now, version: { increment: 1 } },
            include: ruleInclude,
          });
        }
        await tx.scoreRule.updateMany({
          where: { classSectionId: rule.classSectionId, status: 'ACTIVE', id: { not: id } },
          data: {
            status: 'SUPERSEDED',
            supersededAt: now,
            updatedAt: now,
            version: { increment: 1 },
          },
        });
        const active = await tx.scoreRule.update({
          where: { id, version: input.expectedVersion },
          data: { status: 'ACTIVE', activatedAt: now, updatedAt: now, version: { increment: 1 } },
          include: ruleInclude,
        });
        const enrollments = await tx.enrollment.findMany({
          where: {
            organizationId: principal.organizationId,
            classSectionId: rule.classSectionId,
            status: 'ACTIVE',
          },
        });
        for (const enrollment of enrollments) {
          const score = await tx.studentScore.upsert({
            where: { enrollmentId: enrollment.id },
            create: {
              id: this.ids.next(),
              organizationId: enrollment.organizationId,
              semesterId: enrollment.semesterId,
              classSectionId: enrollment.classSectionId,
              studentId: enrollment.studentId,
              enrollmentId: enrollment.id,
              createdAt: now,
              updatedAt: now,
            },
            update: {},
          });
          await this.recalculate(tx, score, active, now);
        }
        return tx.scoreRule.findUniqueOrThrow({ where: { id }, include: ruleInclude });
      },
    );
  }

  rejectRule(
    principal: AuthenticatedPrincipal,
    id: string,
    input: VersionedReasonRequestDto,
    facts: MutationFacts,
  ): Promise<Record<string, unknown>> {
    return this.ruleMutation(
      principal,
      'rejectScoreRule',
      id,
      input,
      facts,
      'SCORE-RULE-REJECT',
      async (tx, rule) => {
        if (rule.status !== 'PENDING_APPROVAL')
          throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
        await this.assertActiveAdmin(tx, principal);
        const now = this.clock.now();
        await tx.scoreRuleApprovalEvent.create({
          data: {
            id: this.ids.next(),
            organizationId: principal.organizationId,
            scoreRuleId: id,
            action: 'REJECT',
            actorUserId: principal.userId,
            reason: input.reason,
            requestId: facts.requestId,
            createdAt: now,
          },
        });
        return tx.scoreRule.update({
          where: { id, version: input.expectedVersion },
          data: { status: 'REJECTED', updatedAt: now, version: { increment: 1 } },
          include: ruleInclude,
        });
      },
    );
  }

  async listScores(
    principal: AuthenticatedPrincipal,
    input: ScoreListQueryDto,
  ): Promise<PagedResult<Record<string, unknown>>> {
    if (principal.role==='STUDENT') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED',403,{reason:'STUDENT_GRADES_NOT_PUBLIC'});
    const scope = this.scoreWhereForPrincipal(principal, input.classSectionId);
    const binding = {
      resource: 'STUDENT_SCORE' as const,
      organizationId: principal.organizationId,
      principalId: principal.userId,
      role: principal.role,
      filters: {
        classSectionId: input.classSectionId ?? null,
        enrollmentId: input.enrollmentId ?? null,
        status: input.status ?? null,
      },
      sort: '-updatedAt',
      limit: input.limit,
    };
    const position = this.cursors.decode(input.cursor, binding);
    const updatedAt = position === null ? null : new Date(position.value);
    if (updatedAt !== null && Number.isNaN(updatedAt.getTime())) this.invalidCursor();
    const rows = await this.prisma.studentScore.findMany({
      where: {
        ...scope,
        ...(input.enrollmentId === undefined ? {} : { enrollmentId: input.enrollmentId }),
        ...studentScoreStatusWhere(
          input.status,
          this.prisma.studentScore.fields.publishedRevisionId,
        ),
        ...(position === null
          ? {}
          : {
              OR: [
                { updatedAt: { lt: updatedAt! } },
                { updatedAt: updatedAt!, id: { lt: position.id } },
              ],
            }),
      },
      include: scoreInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });
    const page = rows.slice(0, input.limit);
    const last = page.at(-1);
    return pagedResult(
      page.map((row) => projectStudentScore(row, principal)),
      {
        hasMore: rows.length > input.limit,
        limit: input.limit,
        nextCursor:
          rows.length > input.limit && last !== undefined
            ? this.cursors.encode(binding, { value: last.updatedAt.toISOString(), id: last.id })
            : null,
      },
    );
  }

  async getScore(principal: AuthenticatedPrincipal, id: string): Promise<Record<string, unknown>> {
    const score = await this.findAuthorizedScore(this.prisma, principal, id);
    return projectStudentScore(score, principal);
  }

  recalculateScore(
    principal: AuthenticatedPrincipal,
    id: string,
    input: ExpectedVersionRequestDto,
    facts: MutationFacts,
  ): Promise<Record<string, unknown>> {
    return this.mutate(principal, 'recalculateStudentScore', id, input, facts, async (tx) => {
      const score = await this.findAuthorizedScore(tx, principal, id, true);
      if (score.version !== input.expectedVersion)
        throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      const rule = await tx.scoreRule.findFirst({
        where: {
          organizationId: principal.organizationId,
          classSectionId: score.classSectionId,
          status: 'ACTIVE',
        },
        include: ruleInclude,
      });
      if (rule === null) throw new ApplicationError('SCORE_RULE_NOT_CONFIGURED', 409);
      const result = await this.recalculate(tx, score, rule, this.clock.now());
      await this.appendEvidence(
        tx,
        principal,
        facts,
        'SCORE_RECALCULATED',
        'STUDENT-SCORE-RECALCULATE',
        'STUDENT_SCORE',
        id,
        result.version,
        {
          classSectionId: score.classSectionId,
          calculationRevision: result.currentWorkingRevision?.calculationRevision ?? null,
        },
      );
      return projectStudentScore(result, principal);
    });
  }

  publishScore(
    principal: AuthenticatedPrincipal,
    id: string,
    input: ExpectedVersionRequestDto,
    facts: MutationFacts,
  ): Promise<Record<string, unknown>> {
    return this.mutate(principal, 'publishStudentScore', id, input, facts, async (tx) => {
      const score = await this.findAuthorizedScore(tx, principal, id, true);
      if (score.version !== input.expectedVersion || score.currentWorkingRevisionId === null)
        throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      const pendingReview = await tx.exerciseRecord.findFirst({
        where: { enrollmentId: score.enrollmentId, status: 'SUBMITTED' },
      });
      const pendingAdjustment = await tx.scoreAdjustment.findFirst({
        where: { studentScoreId: id, status: 'PENDING_APPROVAL' },
      });
      if (pendingReview !== null || pendingAdjustment !== null)
        throw new ApplicationError('SCORE_NOT_PUBLISHABLE', 409);
      const now = this.clock.now();
      const updated = await tx.studentScore.update({
        where: { id, version: input.expectedVersion },
        data: {
          publishedRevisionId: score.currentWorkingRevisionId,
          updatedAt: now,
          version: { increment: 1 },
        },
        include: scoreInclude,
      });
      await tx.scorePublicationEvent.create({
        data: {
          id: this.ids.next(),
          organizationId: principal.organizationId,
          studentScoreId: id,
          studentScoreRevisionId: score.currentWorkingRevisionId,
          action: 'PUBLISH',
          actorUserId: principal.userId,
          requestId: facts.requestId,
          createdAt: now,
        },
      });
      await this.appendEvidence(
        tx,
        principal,
        facts,
        'SCORE_PUBLISHED',
        'STUDENT-SCORE-PUBLISH',
        'STUDENT_SCORE',
        id,
        updated.version,
        {
          classSectionId: score.classSectionId,
          calculationRevision: updated.currentWorkingRevision?.calculationRevision ?? null,
        },
      );
      return projectStudentScore(updated, principal);
    });
  }

  async denyCorrection(
    principal: AuthenticatedPrincipal,
    id: string,
    input: VersionedReasonRequestDto,
  ): Promise<never> {
    const score = await this.findAuthorizedScore(this.prisma, principal, id, true);
    if (score.version !== input.expectedVersion)
      throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
    throw new ApplicationError('SCORE_CORRECTION_NOT_ALLOWED', 409);
  }

  async listAdjustments(
    principal: AuthenticatedPrincipal,
    scoreId: string,
    input: ScoreAdjustmentListQueryDto,
  ): Promise<PagedResult<Record<string, unknown>>> {
    await this.findAuthorizedScore(this.prisma, principal, scoreId, principal.role === 'TEACHER');
    if (principal.role === 'STUDENT')
      throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    const binding = {
      resource: 'SCORE_ADJUSTMENT' as const,
      organizationId: principal.organizationId,
      principalId: principal.userId,
      role: principal.role,
      filters: { studentScoreId: scoreId },
      sort: '-requestedAt',
      limit: input.limit,
    };
    const position = this.cursors.decode(input.cursor, binding);
    const requestedAt = position === null ? null : new Date(position.value);
    if (requestedAt !== null && Number.isNaN(requestedAt.getTime())) this.invalidCursor();
    const rows = await this.prisma.scoreAdjustment.findMany({
      where: {
        organizationId: principal.organizationId,
        studentScoreId: scoreId,
        ...(position === null
          ? {}
          : {
              OR: [
                { requestedAt: { lt: requestedAt! } },
                { requestedAt: requestedAt!, id: { lt: position.id } },
              ],
            }),
      },
      include: adjustmentInclude,
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });
    const page = rows.slice(0, input.limit);
    const last = page.at(-1);
    return pagedResult(page.map(projectScoreAdjustment), {
      hasMore: rows.length > input.limit,
      limit: input.limit,
      nextCursor:
        rows.length > input.limit && last !== undefined
          ? this.cursors.encode(binding, { value: last.requestedAt.toISOString(), id: last.id })
          : null,
    });
  }

  createAdjustment(
    principal: AuthenticatedPrincipal,
    scoreId: string,
    input: CreateScoreAdjustmentRequestDto,
    facts: MutationFacts,
  ): Promise<Record<string, unknown>> {
    return this.mutate(principal, 'createScoreAdjustment', scoreId, input, facts, async (tx) => {
      const score = await this.findAuthorizedScore(tx, principal, scoreId, true);
      if (score.version !== input.expectedVersion)
        throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      if (!isSafeScoreEvidenceReference(input.evidenceReference))
        throw new ApplicationError('SCORE_ADJUSTMENT_EVIDENCE_INVALID', 422);
      const now = this.clock.now();
      const adjustment = await tx.scoreAdjustment.create({
        data: {
          id: this.ids.next(),
          organizationId: principal.organizationId,
          studentScoreId: score.id,
          studentId: score.studentId,
          enrollmentId: score.enrollmentId,
          adjustmentType: input.adjustmentType,
          adjustmentValue: new Prisma.Decimal(input.adjustmentValue),
          reasonCode: input.reasonCode,
          reason: input.reason,
          evidenceReference: input.evidenceReference,
          status: 'PENDING_APPROVAL',
          requestedBy: principal.userId,
          requestedAt: now,
          requestId: facts.requestId,
          createdAt: now,
          updatedAt: now,
        },
        include: adjustmentInclude,
      });
      await this.appendEvidence(
        tx,
        principal,
        facts,
        'SCORE_ADJUSTED',
        'SCORE-ADJUSTMENT-CREATE',
        'SCORE_ADJUSTMENT',
        adjustment.id,
        adjustment.version,
        { classSectionId: score.classSectionId, status: 'PENDING_APPROVAL' },
      );
      return projectScoreAdjustment(adjustment);
    });
  }

  approveAdjustment(
    principal: AuthenticatedPrincipal,
    id: string,
    input: ScoreApprovalRequestDto,
    facts: MutationFacts,
  ): Promise<Record<string, unknown>> {
    return this.adjustmentDecision(
      principal,
      'approveScoreAdjustment',
      id,
      input,
      facts,
      'APPROVE',
    );
  }

  rejectAdjustment(
    principal: AuthenticatedPrincipal,
    id: string,
    input: VersionedReasonRequestDto,
    facts: MutationFacts,
  ): Promise<Record<string, unknown>> {
    return this.adjustmentDecision(principal, 'rejectScoreAdjustment', id, input, facts, 'REJECT');
  }

  async processReviewChange(recordId: string): Promise<void> {
    const workflow=await this.prisma.$queryRaw<{record_id:string}[]>`SELECT record_id FROM v81_record_workflows WHERE record_id=${recordId}::uuid`;
    if(workflow.length) return; // V8.1 progress is recomputed inside the deciding transaction.
    const record = await this.prisma.exerciseRecord.findUnique({ where: { id: recordId } });
    if (record === null) return;
    const rule = await this.prisma.scoreRule.findFirst({
      where: { classSectionId: record.classSectionId, status: 'ACTIVE' },
      include: ruleInclude,
    });
    if (rule === null) return;
    await this.prisma.$transaction(async (tx) => {
      const now = this.clock.now();
      // A rule can become active before a student joins the class. Review
      // processing therefore owns the last-mile creation of the derived score
      // aggregate instead of silently dropping an otherwise valid record.
      const score = await tx.studentScore.upsert({
        where: { enrollmentId: record.enrollmentId },
        create: {
          id: this.ids.next(),
          organizationId: record.organizationId,
          semesterId: record.semesterId,
          classSectionId: record.classSectionId,
          studentId: record.studentId,
          enrollmentId: record.enrollmentId,
          createdAt: now,
          updatedAt: now,
        },
        update: {},
      });
      await this.recalculate(tx, score, rule, now);
    });
  }

  private adjustmentDecision(
    principal: AuthenticatedPrincipal,
    operationId: string,
    id: string,
    input: ScoreApprovalRequestDto | VersionedReasonRequestDto,
    facts: MutationFacts,
    action: 'APPROVE' | 'REJECT',
  ): Promise<Record<string, unknown>> {
    return this.mutate(principal, operationId, id, input, facts, async (tx) => {
      await this.assertActiveAdmin(tx, principal);
      const adjustment = await tx.scoreAdjustment.findFirst({
        where: { id, organizationId: principal.organizationId },
        include: adjustmentInclude,
      });
      if (adjustment === null) throw new ApplicationError('SCORE_NOT_FOUND', 404);
      if (adjustment.status !== 'PENDING_APPROVAL' || adjustment.version !== input.expectedVersion)
        throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      if (adjustment.requestedBy === principal.userId)
        throw new ApplicationError('SCORE_ADJUSTMENT_SELF_APPROVAL_NOT_ALLOWED', 409);
      const now = this.clock.now();
      await tx.scoreAdjustmentApprovalEvent.create({
        data: {
          id: this.ids.next(),
          organizationId: principal.organizationId,
          scoreAdjustmentId: id,
          action,
          actorUserId: principal.userId,
          reason: input.reason ?? null,
          requestId: facts.requestId,
          createdAt: now,
        },
      });
      const decided = await tx.scoreAdjustment.update({
        where: { id, version: input.expectedVersion },
        data: {
          status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          decidedAt: now,
          updatedAt: now,
          version: { increment: 1 },
        },
        include: adjustmentInclude,
      });
      if (action === 'APPROVE') {
        const score = await tx.studentScore.findUniqueOrThrow({
          where: { id: adjustment.studentScoreId },
        });
        const rule = await tx.scoreRule.findFirst({
          where: { classSectionId: score.classSectionId, status: 'ACTIVE' },
          include: ruleInclude,
        });
        if (rule === null) throw new ApplicationError('SCORE_RULE_NOT_CONFIGURED', 409);
        await this.recalculate(tx, score, rule, now);
      }
      await this.appendEvidence(
        tx,
        principal,
        facts,
        'SCORE_ADJUSTED',
        action === 'APPROVE' ? 'SCORE-ADJUSTMENT-APPROVE' : 'SCORE-ADJUSTMENT-REJECT',
        'SCORE_ADJUSTMENT',
        id,
        decided.version,
        { status: decided.status },
      );
      return projectScoreAdjustment(decided);
    });
  }

  private async recalculate(
    tx: Transaction,
    score: StudentScore,
    rule: { id: string; organizationId: string },
    now: Date,
  ): Promise<Prisma.StudentScoreGetPayload<{ include: typeof scoreInclude }>> {
    const valid = await loadValidScoreSources(tx, score.enrollmentId);
    const total = totalValidCreditedSeconds(valid);
    const adjustments = await tx.scoreAdjustment.findMany({
      where: { studentScoreId: score.id, status: 'APPROVED' },
      orderBy: [{ decidedAt: 'asc' }, { id: 'asc' }],
    });
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          ruleId: rule.id,
          contributions: valid.map(({ record, review }) => [
            record.id,
            review.id,
            record.creditedDurationSeconds.toString(),
          ]),
          adjustments: adjustments.map((item) => [item.id, item.version]),
        }),
      )
      .digest('hex');
    const existing = await tx.studentScoreRevision.findFirst({
      where: { studentScoreId: score.id, scoreRuleId: rule.id, sourceFingerprint: fingerprint },
    });
    if (existing !== null) {
      return tx.studentScore.findUniqueOrThrow({ where: { id: score.id }, include: scoreInclude });
    }
    const calculation = calculateScore(total);
    let finalScore: Prisma.Decimal;
    try {
      finalScore = applyApprovedAdjustments(calculation.finalScore, adjustments);
    } catch {
      throw new ApplicationError('SCORE_ADJUSTMENT_INVALID', 422);
    }
    const latest = await tx.studentScoreRevision.aggregate({
      where: { studentScoreId: score.id },
      _max: { calculationRevision: true },
    });
    const revision = await tx.studentScoreRevision.create({
      data: {
        id: this.ids.next(),
        organizationId: score.organizationId,
        studentScoreId: score.id,
        scoreRuleId: rule.id,
        calculationRevision: (latest._max.calculationRevision ?? 0) + 1,
        totalValidCreditedSeconds: total,
        scoringSeconds: calculation.scoringSeconds,
        excessSeconds: calculation.excessSeconds,
        qualificationStatus: calculation.qualificationStatus,
        calculatedScore: calculation.finalScore,
        adjustedScore: finalScore,
        finalScore,
        sourceFingerprint: fingerprint,
        status: adjustments.length === 0 ? 'CALCULATED' : 'ADJUSTED',
        calculatedAt: now,
        createdAt: now,
      },
    });
    if (valid.length > 0)
      await tx.scoreContribution.createMany({
        data: valid.map(({ record, review }) => ({
          id: this.ids.next(),
          organizationId: score.organizationId,
          studentScoreRevisionId: revision.id,
          recordId: record.id,
          reviewId: review.id,
          scoreRuleId: rule.id,
          creditType: record.creditType,
          contributionSeconds: record.creditedDurationSeconds,
          createdAt: now,
        })),
      });
    await tx.scoreRecalculationAttempt.upsert({
      where: {
        studentScoreId_scoreRuleId_sourceFingerprint: {
          studentScoreId: score.id,
          scoreRuleId: rule.id,
          sourceFingerprint: fingerprint,
        },
      },
      create: {
        id: this.ids.next(),
        organizationId: score.organizationId,
        studentScoreId: score.id,
        scoreRuleId: rule.id,
        sourceFingerprint: fingerprint,
        status: 'COMPLETED',
        attempts: 1,
        availableAt: now,
        processedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      update: { status: 'COMPLETED', processedAt: now, updatedAt: now },
    });
    return tx.studentScore.update({
      where: { id: score.id },
      data: { currentWorkingRevisionId: revision.id, updatedAt: now, version: { increment: 1 } },
      include: scoreInclude,
    });
  }

  private async ruleMutation(
    principal: AuthenticatedPrincipal,
    operationId: string,
    id: string,
    input: ExpectedVersionRequestDto,
    facts: MutationFacts,
    permissionId: string,
    action: (
      tx: Transaction,
      rule: Prisma.ScoreRuleGetPayload<{ include: typeof ruleInclude }>,
    ) => Promise<Prisma.ScoreRuleGetPayload<{ include: typeof ruleInclude }>>,
  ): Promise<Record<string, unknown>> {
    return this.mutate(principal, operationId, id, input, facts, async (tx) => {
      const rule = await tx.scoreRule.findFirst({
        where: { id, organizationId: principal.organizationId },
        include: ruleInclude,
      });
      if (rule === null) throw new ApplicationError('SCORE_RULE_NOT_FOUND', 404);
      if (rule.version !== input.expectedVersion)
        throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      const updated = await action(tx, rule);
      await this.appendEvidence(
        tx,
        principal,
        facts,
        'SCORE_RULE_CHANGED',
        permissionId,
        'SCORE_RULE',
        id,
        updated.version,
        { classSectionId: rule.classSectionId, status: updated.status },
      );
      return projectScoreRule(updated);
    });
  }

  private mutate<T>(
    principal: AuthenticatedPrincipal,
    operationId: string,
    scope: string,
    request: unknown,
    facts: MutationFacts,
    action: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId,
        scope: `${principal.organizationId}:${scope}`,
        key: facts.idempotencyKey,
        request,
        requestId: facts.requestId,
      },
      async (tx) => {
        try {
          return this.idempotency.success(await action(tx), {
            principalId: principal.userId,
            authSessionId: principal.sessionId,
          });
        } catch (error: unknown) {
          if (error instanceof ApplicationError) return this.idempotency.failure(error);
          throw error;
        }
      },
    );
  }

  private async findAuthorizedScore(
    transaction: PrismaService | Transaction,
    principal: AuthenticatedPrincipal,
    id: string,
    teacherOnly = false,
  ): Promise<Prisma.StudentScoreGetPayload<{ include: typeof authorizedScoreInclude }>> {
    if (teacherOnly && principal.role !== 'TEACHER')
      throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    const score = await transaction.studentScore.findFirst({
      where: { id, organizationId: principal.organizationId },
      include: authorizedScoreInclude,
    });
    if (score === null) throw new ApplicationError('SCORE_NOT_FOUND', 404);
    if (principal.role === 'STUDENT' && score.student.userId !== principal.userId)
      throw new ApplicationError('SCORE_NOT_FOUND', 404);
    if (principal.role === 'TEACHER' && score.classSection.teacher.userId !== principal.userId)
      throw new ApplicationError('SCORE_NOT_FOUND', 404);
    return score;
  }

  private scoreWhereForPrincipal(
    principal: AuthenticatedPrincipal,
    classSectionId?: string,
  ): Prisma.StudentScoreWhereInput {
    const base: Prisma.StudentScoreWhereInput = {
      organizationId: principal.organizationId,
      ...(classSectionId === undefined ? {} : { classSectionId }),
    };
    if (principal.role === 'STUDENT') return { ...base, student: { userId: principal.userId } };
    if (principal.role === 'TEACHER')
      return { ...base, classSection: { teacher: { userId: principal.userId } } };
    return base;
  }

  private invalidCursor(): never {
    throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422, {
      fieldErrors: [
        {
          field: 'cursor',
          code: 'INVALID',
          i18nKey: 'error.validation.failed',
          params: {},
        },
      ],
    });
  }

  private async assertClassSectionReadScope(
    transaction: PrismaService | Transaction,
    principal: AuthenticatedPrincipal,
    classSectionId: string,
  ): Promise<void> {
    const section = await transaction.classSection.findFirst({
      where: { id: classSectionId, organizationId: principal.organizationId },
      include: { teacher: true },
    });
    if (
      section === null ||
      (principal.role === 'TEACHER' && section.teacher.userId !== principal.userId)
    )
      throw new ApplicationError('COURSE_CLASS_SECTION_NOT_FOUND', 404);
  }

  private async assertActiveAdmin(
    tx: Transaction,
    principal: AuthenticatedPrincipal,
  ): Promise<void> {
    const admin = await tx.adminProfile.findFirst({
      where: {
        organizationId: principal.organizationId,
        userId: principal.userId,
        status: 'ACTIVE',
        deletedAt: null,
      },
    });
    if (principal.role !== 'ADMIN' || admin === null)
      throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
  }

  private async appendEvidence(
    tx: Transaction,
    principal: AuthenticatedPrincipal,
    facts: MutationFacts,
    actionType: 'SCORE_RULE_CHANGED' | 'SCORE_RECALCULATED' | 'SCORE_ADJUSTED' | 'SCORE_PUBLISHED',
    permissionId: string,
    targetType: string,
    targetId: string,
    eventVersion: number,
    safeMetadata: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.append(tx, {
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      actorRoleSnapshot: principal.role,
      permissionId,
      actionType,
      targetType,
      targetId,
      requestId: facts.requestId,
      idempotencyKeyReference:
        facts.idempotencyKey === undefined
          ? null
          : this.digest.digest('idempotency-key-reference', facts.idempotencyKey),
      outcome: 'SUCCEEDED',
      safeMetadata,
    });
    await this.outbox.append(tx, {
      organizationId: principal.organizationId,
      aggregateType: targetType,
      aggregateId: targetId,
      eventType: `${actionType}_V1`,
      eventVersion,
      payload: { targetId, eventVersion },
    });
  }
}
