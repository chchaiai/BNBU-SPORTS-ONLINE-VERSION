import type { AuthenticatedPrincipal } from '../../../common/http/request-context.js';
import { ApplicationError } from '../../../common/errors/application-error.js';
import type {
  ScoreAdjustment,
  ScoreAdjustmentApprovalEvent,
  ScoreContribution,
  ScorePublicationEvent,
  ScoreRule,
  ScoreRuleApprovalEvent,
  StudentScore,
  StudentScoreRevision,
} from '../../../generated/prisma/client.js';

type RuleWithEvents = ScoreRule & { approvalEvents: ScoreRuleApprovalEvent[] };
type RevisionWithContributions = StudentScoreRevision & { contributions: ScoreContribution[] };
type ScoreWithRevisions = StudentScore & {
  currentWorkingRevision: RevisionWithContributions | null;
  publishedRevision: RevisionWithContributions | null;
  publicationEvents: ScorePublicationEvent[];
};
type AdjustmentWithEvents = ScoreAdjustment & {
  approvalEvents: ScoreAdjustmentApprovalEvent[];
};

const decimal = (value: { toNumber(): number }): number => value.toNumber();

export function projectScoreRule(rule: RuleWithEvents): Record<string, unknown> {
  return {
    id: rule.id,
    organizationId: rule.organizationId,
    classSectionId: rule.classSectionId,
    ruleCode: rule.ruleCode,
    ruleVersion: rule.ruleVersion,
    displayName: rule.displayName,
    totalRequiredSeconds: Number(rule.totalRequiredSeconds),
    calculationDefinition: rule.calculationDefinition,
    roundingMode: rule.roundingMode,
    roundingScale: rule.roundingScale,
    status: rule.status,
    effectiveFrom: rule.activatedAt?.toISOString() ?? null,
    effectiveTo: rule.supersededAt?.toISOString() ?? null,
    submittedAt: rule.submittedAt?.toISOString() ?? null,
    activatedAt: rule.activatedAt?.toISOString() ?? null,
    approvalCount: rule.approvalEvents.filter((event) => event.action === 'APPROVE').length,
    approvalEvents: rule.approvalEvents.map((event) => ({
      id: event.id,
      scoreRuleId: event.scoreRuleId,
      action: event.action,
      actorUserId: event.actorUserId,
      reason: event.reason,
      createdAt: event.createdAt.toISOString(),
    })),
    version: rule.version,
  };
}

function creditedSeconds(revision: RevisionWithContributions, creditType: string): number {
  return revision.contributions
    .filter((contribution) => contribution.creditType === creditType)
    .reduce((total, contribution) => total + Number(contribution.contributionSeconds), 0);
}

function projectRevision(
  score: ScoreWithRevisions,
  revision: RevisionWithContributions,
  options: { published: boolean; hideUnpublishedScore: boolean },
): Record<string, unknown> {
  const publication = options.published ? score.publicationEvents.at(0) : undefined;
  return {
    id: score.id,
    organizationId: score.organizationId,
    enrollmentId: score.enrollmentId,
    scoreRuleId: revision.scoreRuleId,
    calculationRevision: revision.calculationRevision,
    validCourseDurationSeconds: creditedSeconds(revision, 'COURSE_RELATED'),
    validGeneralDurationSeconds: creditedSeconds(revision, 'GENERAL'),
    totalValidDurationSeconds: Number(revision.totalValidCreditedSeconds),
    scoringSeconds: Number(revision.scoringSeconds),
    excessSeconds: Number(revision.excessSeconds),
    qualificationStatus: revision.qualificationStatus,
    baseScore: options.hideUnpublishedScore ? null : decimal(revision.calculatedScore),
    adjustmentTotal: options.hideUnpublishedScore
      ? 0
      : decimal(revision.adjustedScore.minus(revision.calculatedScore)),
    finalScore: options.hideUnpublishedScore ? null : decimal(revision.finalScore),
    status: options.hideUnpublishedScore
      ? 'NOT_CALCULATED'
      : options.published
        ? 'PUBLISHED'
        : revision.status,
    calculatedAt: options.hideUnpublishedScore ? null : revision.calculatedAt.toISOString(),
    publishedAt: publication?.createdAt.toISOString() ?? null,
    lockedAt: null,
    sourceFingerprint: revision.sourceFingerprint,
    version: score.version,
  };
}

export function projectStudentScore(
  score: ScoreWithRevisions,
  principal: AuthenticatedPrincipal,
): Record<string, unknown> {
  if (principal.role === 'STUDENT') {
    throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403, {
      reason: 'STUDENT_GRADES_NOT_PUBLIC',
    });
  }
  if (score.currentWorkingRevision === null)
    throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500);
  const published = score.currentWorkingRevisionId === score.publishedRevisionId;
  return projectRevision(score, score.currentWorkingRevision, {
    published,
    hideUnpublishedScore: false,
  });
}

export function projectScoreAdjustment(adjustment: AdjustmentWithEvents): Record<string, unknown> {
  return {
    id: adjustment.id,
    organizationId: adjustment.organizationId,
    studentScoreId: adjustment.studentScoreId,
    studentId: adjustment.studentId,
    enrollmentId: adjustment.enrollmentId,
    adjustmentType: adjustment.adjustmentType,
    adjustmentValue: decimal(adjustment.adjustmentValue),
    reasonCode: adjustment.reasonCode,
    reason: adjustment.reason,
    evidenceReference: adjustment.evidenceReference,
    status: adjustment.status,
    requestedBy: adjustment.requestedBy,
    requestedAt: adjustment.requestedAt.toISOString(),
    decidedAt: adjustment.decidedAt?.toISOString() ?? null,
    approvalEvents: adjustment.approvalEvents.map((event) => ({
      id: event.id,
      scoreAdjustmentId: event.scoreAdjustmentId,
      action: event.action,
      actorUserId: event.actorUserId,
      reason: event.reason,
      createdAt: event.createdAt.toISOString(),
    })),
    requestId: adjustment.requestId,
    version: adjustment.version,
  };
}
