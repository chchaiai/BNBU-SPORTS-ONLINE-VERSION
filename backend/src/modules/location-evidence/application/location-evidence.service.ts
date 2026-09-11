import { Injectable } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { ApplicationError } from '../../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../../common/http/request-context.js';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service.js';
import { OutboxService } from '../../../common/outbox/outbox.service.js';
import type { ExerciseRecordPolicyContext } from '../../../common/policy/exercise-record-policy-resolver.js';
import type { ExerciseSessionPolicyContext } from '../../../common/policy/exercise-session-policy-resolver.js';
import { SecureDigestService } from '../../../common/security/secure-digest.service.js';
import { Clock } from '../../../common/time/clock.js';
import { IdGenerator } from '../../../common/time/id-generator.js';
import {
  Prisma,
  type LocationConsent,
  type LocationPrivacyPolicy,
  type LocationSummary,
  type LocationTrack,
} from '../../../generated/prisma/client.js';
import { projectCoarseLocation } from '../domain/coarse-location-projection.js';
import {
  evaluateLocationPolicy,
  requireEnabledLocationPolicy,
  type EnabledLocationPolicy,
} from '../domain/location-policy.js';
import { locationRetentionDeadline } from '../domain/location-retention.js';
import {
  classifyLocationSampleBatch,
  type FingerprintedLocationSample,
  type LocationSampleObservation,
} from '../domain/location-sample.js';
import { LocationRawCipher } from '../infrastructure/location-raw-cipher.js';
import { LocationSampleFingerprint } from '../infrastructure/location-sample-fingerprint.js';
import {
  LOCATION_REVOCATION_DISPOSITIONS,
  type AppendLocationSamplesInput,
  type FinalizeLocationTrackInput,
  type InterruptSessionTrackReason,
  type LocationConsentProjection,
  type LocationMutationFacts,
  type LocationPrivacyPolicyProjection,
  type LocationRevocationDisposition,
  type LocationSummaryProjection,
  type LocationTrackProjection,
  type RevokeLocationConsentFacts,
  type StartLocationTrackInput,
  type UpdateLocationPrivacyPolicyInput,
} from './location-evidence.types.js';

type Transaction = Prisma.TransactionClient;

const PURPOSE_CODE = 'EXERCISE_EVIDENCE';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface CompleteStoredPolicy {
  policy: EnabledLocationPolicy;
  revocationDisposition: LocationRevocationDisposition;
}

@Injectable()
export class LocationEvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly digest: SecureDigestService,
    private readonly rawCipher: LocationRawCipher,
    private readonly sampleFingerprint: LocationSampleFingerprint,
  ) {}

  async getPolicy(principal: AuthenticatedPrincipal): Promise<LocationPrivacyPolicyProjection> {
    const policy = await this.prisma.locationPrivacyPolicy.findFirst({
      where: { organizationId: principal.organizationId },
      orderBy: { version: 'desc' },
    });
    if (policy === null) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    return this.projectPolicy(policy);
  }

  async updatePolicy(
    principal: AuthenticatedPrincipal,
    input: UpdateLocationPrivacyPolicyInput,
    facts: LocationMutationFacts,
  ): Promise<LocationPrivacyPolicyProjection> {
    this.assertAdmin(principal);
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'updateLocationPrivacyPolicy',
        scope: principal.organizationId,
        key: facts.idempotencyKey,
        request: input,
        requestId: facts.requestId,
      },
      async (transaction) => {
        try {
          await this.lockLatestPolicy(transaction, principal.organizationId);
          const current = await transaction.locationPrivacyPolicy.findFirst({
            where: { organizationId: principal.organizationId },
            orderBy: { version: 'desc' },
          });
          const currentVersion = current?.version ?? 0;
          if (input.expectedVersion !== currentVersion) {
            throw this.versionMismatch(input.expectedVersion, currentVersion);
          }

          const effectiveAt = this.parseInstant(input.effectiveAt);
          const definition = {
            policyVersion: input.policyVersion,
            collectionEnabled: input.collectionEnabled,
            purposeCode: PURPOSE_CODE,
            sampleIntervalSeconds: input.sampleIntervalSeconds,
            maximumAccuracyMeters: input.maximumAccuracyMeters,
            rawRetentionDays: input.rawRetentionDays,
            coarseRetentionDays: input.coarseRetentionDays,
            coarseProjectionMeters: input.coarseProjectionMeters,
            effectiveAt,
          } as const;
          const evaluation = evaluateLocationPolicy(definition);
          const retentionOrderInvalid =
            input.rawRetentionDays !== null &&
            input.coarseRetentionDays !== null &&
            input.coarseRetentionDays < input.rawRetentionDays;
          const revocationInvalid =
            input.revocationDisposition !== null &&
            !LOCATION_REVOCATION_DISPOSITIONS.includes(input.revocationDisposition);
          if (
            evaluation.invalidParameters.length > 0 ||
            retentionOrderInvalid ||
            revocationInvalid ||
            (input.backgroundCollectionEnabled && !input.collectionEnabled)
          ) {
            throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422);
          }
          if (input.collectionEnabled) {
            requireEnabledLocationPolicy(definition);
            if (input.revocationDisposition === null) {
              throw new ApplicationError('CONFLICT_UNSUPPORTED_RESOURCE_STATE', 409, {
                reason: 'LOCATION_POLICY_INCOMPLETE',
                missingParameters: ['revocationDisposition'],
              });
            }
          }

          const now = this.clock.now();
          const created = await transaction.locationPrivacyPolicy.create({
            data: {
              id: this.ids.next(),
              organizationId: principal.organizationId,
              policyVersion: input.policyVersion.trim(),
              purposeCode: PURPOSE_CODE,
              collectionEnabled: input.collectionEnabled,
              sampleIntervalSeconds: input.sampleIntervalSeconds,
              maximumAccuracyMeters: input.maximumAccuracyMeters,
              rawRetentionDays: input.rawRetentionDays,
              coarseRetentionDays: input.coarseRetentionDays,
              coarseProjectionMeters: input.coarseProjectionMeters,
              backgroundCollectionEnabled: input.backgroundCollectionEnabled,
              revocationDisposition: input.revocationDisposition,
              effectiveAt,
              version: currentVersion + 1,
              createdByUserId: principal.userId,
              createdAt: now,
            },
          });
          await this.appendAudit(transaction, 'LOCATION_POLICY_CHANGED', {
            organizationId: principal.organizationId,
            actor: principal,
            permissionId: 'LOCATION-PRIVACY-POLICY-UPDATE',
            targetType: 'LOCATION_PRIVACY_POLICY',
            targetId: created.id,
            facts,
          });
          await this.outbox.append(transaction, {
            organizationId: principal.organizationId,
            aggregateType: 'LOCATION_PRIVACY_POLICY',
            aggregateId: created.id,
            eventType: 'LOCATION_PRIVACY_POLICY_CHANGED_V1',
            eventVersion: created.version,
            payload: {
              policyId: created.id,
              policyVersion: created.policyVersion,
              collectionEnabled: created.collectionEnabled,
              version: created.version,
              requestId: facts.requestId,
            },
          });
          return this.idempotency.success(this.projectPolicy(created), {
            principalId: principal.userId,
            authSessionId: principal.sessionId,
            resourceType: 'LOCATION_PRIVACY_POLICY',
            resourceId: created.id,
          });
        } catch (error: unknown) {
          if (error instanceof ApplicationError) return this.idempotency.failure(error);
          throw error;
        }
      },
    );
  }

  async start(
    principal: AuthenticatedPrincipal,
    context: ExerciseSessionPolicyContext,
    input: StartLocationTrackInput,
    facts: LocationMutationFacts,
  ): Promise<LocationTrackProjection> {
    this.assertOwnedStudentSession(principal, context);
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'startExerciseLocationTrack',
        scope: `${principal.organizationId}:${context.sessionId}`,
        key: facts.idempotencyKey,
        request: { sessionId: context.sessionId, ...input },
        requestId: facts.requestId,
      },
      async (transaction) => {
        try {
          await this.lockSession(transaction, context.sessionId, principal.organizationId);
          const session = await transaction.exerciseSession.findFirst({
            where: { id: context.sessionId, organizationId: principal.organizationId },
          });
          if (
            session?.studentId !== context.studentId ||
            session?.enrollmentId !== context.enrollmentId ||
            session?.classSectionId !== context.classSectionId
          ) {
            throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
          }
          if (session.status !== 'IN_PROGRESS' || session.currentIntervalStartedAt === null) {
            throw new ApplicationError('CONFLICT_UNSUPPORTED_RESOURCE_STATE', 409, {
              reason: 'LOCATION_REQUIRES_RUNNING_SESSION',
            });
          }
          const now = this.clock.now();
          this.assertClientObservation(input.clientObservedAt, session.startedAt, now);

          const policyCandidate = await transaction.locationPrivacyPolicy.findUnique({
            where: {
              organizationId_policyVersion: {
                organizationId: principal.organizationId,
                policyVersion: input.consentPolicyVersion,
              },
            },
          });
          if (policyCandidate === null || policyCandidate.effectiveAt > now) {
            throw new ApplicationError('CONFLICT_UNSUPPORTED_RESOURCE_STATE', 409, {
              reason: 'LOCATION_POLICY_VERSION_NOT_EFFECTIVE',
            });
          }
          await this.lockPolicy(transaction, policyCandidate.id, principal.organizationId);
          const policy = await transaction.locationPrivacyPolicy.findFirst({
            where: { id: policyCandidate.id, organizationId: principal.organizationId },
          });
          if (policy === null) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
          const completePolicy = this.completePolicy(policy);

          const consent = await this.consentForStart(
            transaction,
            principal,
            context.studentId,
            policy,
            facts,
          );

          await this.lockTrackBySession(transaction, session.id, principal.organizationId);
          const existing = await transaction.locationTrack.findUnique({
            where: { sessionId: session.id },
          });
          if (existing !== null) {
            if (
              existing.organizationId !== principal.organizationId ||
              existing.studentId !== context.studentId ||
              existing.policyId !== policy.id ||
              existing.consentId !== consent.id ||
              !['COLLECTING', 'FINALIZED'].includes(existing.status)
            ) {
              throw new ApplicationError('CONFLICT_UNSUPPORTED_RESOURCE_STATE', 409);
            }
            return this.idempotency.success(this.projectTrack(existing), {
              principalId: principal.userId,
              authSessionId: principal.sessionId,
              resourceType: 'LOCATION_TRACK',
              resourceId: existing.id,
            });
          }

          const trackId = this.ids.next();
          const track = await transaction.locationTrack.create({
            data: {
              id: trackId,
              organizationId: principal.organizationId,
              sessionId: session.id,
              studentId: session.studentId,
              enrollmentId: session.enrollmentId,
              classSectionId: session.classSectionId,
              semesterId: session.semesterId,
              policyId: policy.id,
              policyVersion: policy.policyVersion,
              consentId: consent.id,
              status: 'COLLECTING',
              acceptedSampleCount: 0,
              rejectedSampleCount: 0,
              startedAt: now,
              lastObservedAt: null,
              finalizedAt: null,
              interruptedAt: null,
              deletedAt: null,
              reasonCode: null,
              rawExpiresAt: locationRetentionDeadline(now, completePolicy.policy.rawRetentionDays),
              version: 1,
              createdAt: now,
              updatedAt: now,
            },
          });
          await this.appendTrackEvent(transaction, track, {
            eventType: 'STARTED',
            fromStatus: null,
            toStatus: 'COLLECTING',
            actor: principal,
            facts,
            acceptedSampleCount: 0,
            rejectedSampleCount: 0,
          });
          await this.appendTrackEvidence(transaction, track, principal, facts, 'STARTED');
          return this.idempotency.success(this.projectTrack(track), {
            principalId: principal.userId,
            authSessionId: principal.sessionId,
            resourceType: 'LOCATION_TRACK',
            resourceId: track.id,
          });
        } catch (error: unknown) {
          if (error instanceof ApplicationError) return this.idempotency.failure(error);
          throw error;
        }
      },
    );
  }

  async append(
    principal: AuthenticatedPrincipal,
    context: ExerciseSessionPolicyContext,
    input: AppendLocationSamplesInput,
    facts: LocationMutationFacts,
  ): Promise<LocationTrackProjection> {
    this.assertOwnedStudentSession(principal, context);
    if (input.samples.length < 1 || input.samples.length > 100) {
      throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422);
    }
    const candidates = input.samples.map((sample) => this.fingerprintedSample(sample));
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'appendExerciseLocationSamples',
        scope: `${principal.organizationId}:${context.sessionId}`,
        key: facts.idempotencyKey,
        request: { sessionId: context.sessionId, ...input },
        requestId: facts.requestId,
      },
      async (transaction) => {
        try {
          const locked = await this.lockLocationState(transaction, principal, context);
          const { session, track, consent, policy } = locked;
          if (session.status !== 'IN_PROGRESS' || session.currentIntervalStartedAt === null) {
            throw new ApplicationError('CONFLICT_UNSUPPORTED_RESOURCE_STATE', 409, {
              reason: 'LOCATION_REQUIRES_RUNNING_SESSION',
            });
          }
          if (track.status !== 'COLLECTING' || consent.status !== 'ACTIVE') {
            throw new ApplicationError('CONFLICT_UNSUPPORTED_RESOURCE_STATE', 409);
          }
          this.assertVersion(track.version, input.expectedVersion);
          const completePolicy = this.completePolicy(policy);
          if (
            consent.policyId !== policy.id ||
            consent.policyVersion !== policy.policyVersion ||
            track.policyId !== policy.id ||
            track.policyVersion !== policy.policyVersion
          ) {
            throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
              invariant: 'LOCATION_CONSENT_POLICY_BINDING_INVALID',
            });
          }

          const existingSamples = await transaction.locationSample.findMany({
            where: {
              trackId: track.id,
              sampleId: { in: [...new Set(candidates.map((item) => item.sample.sampleId))] },
            },
            select: { sampleId: true, payloadFingerprint: true },
          });
          const classified = classifyLocationSampleBatch(candidates, {
            sessionStartedAt: session.startedAt,
            now: this.clock.now(),
            rawRetentionDays: completePolicy.policy.rawRetentionDays,
            maximumAccuracyMeters: completePolicy.policy.maximumAccuracyMeters,
            lastAcceptedObservedAt: track.lastObservedAt,
            knownFingerprints: new Map(
              existingSamples.map((sample) => [sample.sampleId, sample.payloadFingerprint]),
            ),
          });
          const now = this.clock.now();
          let latestRawExpiry = track.rawExpiresAt;
          for (let index = 0; index < candidates.length; index += 1) {
            const candidate = candidates[index]!;
            if (classified.results[index]?.disposition !== 'ACCEPTED') continue;
            const sampleRowId = this.ids.next();
            const rawExpiresAt = locationRetentionDeadline(
              candidate.sample.observedAt,
              completePolicy.policy.rawRetentionDays,
            );
            if (rawExpiresAt > latestRawExpiry) latestRawExpiry = rawExpiresAt;
            const ciphertext = this.rawCipher.encrypt(
              {
                organizationId: principal.organizationId,
                trackId: track.id,
                sampleId: candidate.sample.sampleId,
                observedAt: candidate.sample.observedAt,
              },
              {
                latitude: candidate.sample.latitude,
                longitude: candidate.sample.longitude,
                ...(candidate.sample.altitudeMeters === undefined
                  ? {}
                  : { altitudeMeters: candidate.sample.altitudeMeters }),
                ...(candidate.sample.speedMillimetersPerSecond === undefined
                  ? {}
                  : { speedMillimetersPerSecond: candidate.sample.speedMillimetersPerSecond }),
              },
            );
            await transaction.locationSample.create({
              data: {
                id: sampleRowId,
                organizationId: principal.organizationId,
                trackId: track.id,
                sampleId: candidate.sample.sampleId,
                observedAt: candidate.sample.observedAt,
                accuracyMeters: candidate.sample.accuracyMeters,
                payloadFingerprint: candidate.fingerprint,
                acceptedAt: now,
                rawExpiresAt,
              },
            });
            await transaction.locationSampleSecret.create({
              data: {
                sampleRowId,
                ciphertext,
                keyVersion: this.rawCipher.keyVersion,
                createdAt: now,
              },
            });
          }

          if (classified.acceptedCount === 0 && classified.rejectedCount === 0) {
            return this.idempotency.success(this.projectTrack(track), {
              principalId: principal.userId,
              authSessionId: principal.sessionId,
              resourceType: 'LOCATION_TRACK',
              resourceId: track.id,
            });
          }
          const nextVersion = track.version + 1;
          const changed = await transaction.locationTrack.updateMany({
            where: { id: track.id, version: track.version, status: 'COLLECTING' },
            data: {
              acceptedSampleCount: { increment: classified.acceptedCount },
              rejectedSampleCount: { increment: classified.rejectedCount },
              lastObservedAt: classified.nextLastAcceptedObservedAt,
              rawExpiresAt: latestRawExpiry,
              version: nextVersion,
              updatedAt: now,
            },
          });
          if (changed.count !== 1) throw this.versionMismatch(track.version, nextVersion);
          const updated = await transaction.locationTrack.findUniqueOrThrow({
            where: { id: track.id },
          });
          await this.appendTrackEvent(transaction, updated, {
            eventType: 'SAMPLES_APPENDED',
            fromStatus: 'COLLECTING',
            toStatus: 'COLLECTING',
            actor: principal,
            facts,
            acceptedSampleCount: classified.acceptedCount,
            rejectedSampleCount: classified.rejectedCount,
          });
          await this.appendTrackEvidence(
            transaction,
            updated,
            principal,
            facts,
            'SAMPLES_APPENDED',
            classified.acceptedCount,
            classified.rejectedCount,
          );
          return this.idempotency.success(this.projectTrack(updated), {
            principalId: principal.userId,
            authSessionId: principal.sessionId,
            resourceType: 'LOCATION_TRACK',
            resourceId: updated.id,
          });
        } catch (error: unknown) {
          if (error instanceof ApplicationError) return this.idempotency.failure(error);
          throw error;
        }
      },
    );
  }

  async finalize(
    principal: AuthenticatedPrincipal,
    context: ExerciseSessionPolicyContext,
    input: FinalizeLocationTrackInput,
    facts: LocationMutationFacts,
  ): Promise<LocationTrackProjection> {
    this.assertOwnedStudentSession(principal, context);
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'finalizeExerciseLocationTrack',
        scope: `${principal.organizationId}:${context.sessionId}`,
        key: facts.idempotencyKey,
        request: { sessionId: context.sessionId, ...input },
        requestId: facts.requestId,
      },
      async (transaction) => {
        try {
          const { session, track, consent, policy } = await this.lockLocationState(
            transaction,
            principal,
            context,
          );
          if (track.status === 'FINALIZED') {
            return this.idempotency.success(this.projectTrack(track), {
              principalId: principal.userId,
              authSessionId: principal.sessionId,
              resourceType: 'LOCATION_TRACK',
              resourceId: track.id,
            });
          }
          if (track.status !== 'COLLECTING' || consent.status !== 'ACTIVE') {
            throw new ApplicationError('CONFLICT_UNSUPPORTED_RESOURCE_STATE', 409);
          }
          this.assertVersion(track.version, input.expectedVersion);
          const now = this.clock.now();
          this.assertClientObservation(input.clientObservedAt, session.startedAt, now);
          if (session.status === 'CANCELLED') {
            throw new ApplicationError('CONFLICT_UNSUPPORTED_RESOURCE_STATE', 409);
          }
          const completePolicy = this.completePolicy(policy);
          const samples = await transaction.locationSample.findMany({
            where: { trackId: track.id },
            include: { secret: true },
            orderBy: [{ observedAt: 'asc' }, { sampleId: 'asc' }],
          });
          const hasCompleteRawSet =
            samples.length === track.acceptedSampleCount &&
            samples.every((sample) => sample.secret);
          let availability: LocationSummary['availability'] = 'WITHHELD';
          let coarseRoutePolyline: string | null = null;
          let coarseDistanceMeters: number | null = null;
          let observedStartAt: Date | null = null;
          let observedEndAt: Date | null = null;
          let expiresAt: Date | null = null;
          let qualityFlags: string[] = [];

          if (track.acceptedSampleCount === 0) {
            availability = 'NOT_COLLECTED';
          } else if (hasCompleteRawSet) {
            const points = samples.map((sample) => {
              const secret = sample.secret!;
              if (secret.keyVersion !== this.rawCipher.keyVersion) {
                throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
                  invariant: 'LOCATION_RAW_CIPHER_KEY_VERSION_UNAVAILABLE',
                });
              }
              const payload = this.rawCipher.decrypt(
                {
                  organizationId: sample.organizationId,
                  trackId: sample.trackId,
                  sampleId: sample.sampleId,
                  observedAt: sample.observedAt,
                },
                secret.ciphertext,
              );
              return {
                sampleId: sample.sampleId,
                observedAt: sample.observedAt,
                latitude: payload.latitude,
                longitude: payload.longitude,
              };
            });
            const coarse = projectCoarseLocation(
              points,
              completePolicy.policy.coarseProjectionMeters,
            );
            qualityFlags = [...coarse.qualityFlags];
            if (coarse.coarseRoute !== null) {
              availability = 'AVAILABLE';
              coarseRoutePolyline = coarse.coarseRoute;
              coarseDistanceMeters = coarse.coarseDistanceMeters;
              observedStartAt = samples[0]!.observedAt;
              observedEndAt = samples.at(-1)!.observedAt;
              expiresAt = locationRetentionDeadline(now, completePolicy.policy.coarseRetentionDays);
            }
          }

          const existingSummary = await transaction.locationSummary.findUnique({
            where: { trackId: track.id },
          });
          if (existingSummary !== null) {
            throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
              invariant: 'LOCATION_SUMMARY_PREEXISTS_COLLECTING_TRACK',
            });
          }
          const record = await transaction.exerciseRecord.findUnique({
            where: { sessionId: session.id },
            select: { id: true },
          });
          await transaction.locationSummary.create({
            data: {
              id: this.ids.next(),
              organizationId: principal.organizationId,
              trackId: track.id,
              recordId: record?.id ?? null,
              availability,
              coarseRoutePolyline,
              coarseDistanceMeters,
              observedStartAt,
              observedEndAt,
              expiresAt,
              policyVersion: policy.policyVersion,
              qualityFlags,
              version: 1,
              createdAt: now,
              updatedAt: now,
            },
          });
          const nextVersion = track.version + 1;
          const changed = await transaction.locationTrack.updateMany({
            where: { id: track.id, version: track.version, status: 'COLLECTING' },
            data: {
              status: 'FINALIZED',
              finalizedAt: now,
              version: nextVersion,
              updatedAt: now,
            },
          });
          if (changed.count !== 1) throw this.versionMismatch(track.version, nextVersion);
          const updated = await transaction.locationTrack.findUniqueOrThrow({
            where: { id: track.id },
          });
          await this.appendTrackEvent(transaction, updated, {
            eventType: 'FINALIZED',
            fromStatus: 'COLLECTING',
            toStatus: 'FINALIZED',
            actor: principal,
            facts,
            acceptedSampleCount: 0,
            rejectedSampleCount: 0,
          });
          await this.appendTrackEvidence(transaction, updated, principal, facts, 'FINALIZED');
          return this.idempotency.success(this.projectTrack(updated), {
            principalId: principal.userId,
            authSessionId: principal.sessionId,
            resourceType: 'LOCATION_TRACK',
            resourceId: updated.id,
          });
        } catch (error: unknown) {
          if (error instanceof ApplicationError) return this.idempotency.failure(error);
          throw error;
        }
      },
    );
  }

  async summary(
    principal: AuthenticatedPrincipal,
    context: ExerciseRecordPolicyContext,
  ): Promise<LocationSummaryProjection> {
    this.assertRecordScope(principal, context);
    const record = await this.prisma.exerciseRecord.findFirst({
      where: {
        id: context.recordId,
        organizationId: context.organizationId,
        studentId: context.studentId,
        enrollmentId: context.enrollmentId,
        classSectionId: context.classSectionId,
      },
      select: { sessionId: true },
    });
    if (record === null) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    const summary = await this.prisma.locationSummary.findFirst({
      where: {
        organizationId: context.organizationId,
        OR: [{ recordId: context.recordId }, { track: { sessionId: record.sessionId } }],
      },
    });
    if (summary === null) return this.emptySummary(context.recordId, 'NOT_COLLECTED');
    if (summary.expiresAt !== null && summary.expiresAt <= this.clock.now()) {
      return this.emptySummary(context.recordId, 'EXPIRED', summary.policyVersion);
    }
    return this.projectSummary(context.recordId, summary);
  }

  async revokeConsent(
    principal: AuthenticatedPrincipal,
    facts: RevokeLocationConsentFacts,
    disposition: LocationRevocationDisposition,
  ): Promise<LocationConsentProjection> {
    this.assertStudent(principal);
    if (!LOCATION_REVOCATION_DISPOSITIONS.includes(disposition)) {
      throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422);
    }
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'revokeLocationConsentInternal',
        scope: `${principal.organizationId}:${principal.userId}`,
        key: facts.idempotencyKey,
        request: { expectedVersion: facts.expectedVersion, disposition },
        requestId: facts.requestId,
      },
      async (transaction) => {
        try {
          const student = await transaction.studentProfile.findFirst({
            where: {
              organizationId: principal.organizationId,
              userId: principal.userId,
              deletedAt: null,
            },
            select: { id: true },
          });
          if (student === null) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
          await this.lockConsentByStudent(transaction, principal.organizationId, student.id);
          const consent = await transaction.locationConsent.findUnique({
            where: {
              organizationId_studentId_purposeCode: {
                organizationId: principal.organizationId,
                studentId: student.id,
                purposeCode: PURPOSE_CODE,
              },
            },
          });
          if (consent === null) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
          if (consent.status === 'REVOKED') {
            return this.idempotency.success(this.projectConsent(consent));
          }
          this.assertVersion(consent.version, facts.expectedVersion);
          const policy = await transaction.locationPrivacyPolicy.findFirst({
            where: { id: consent.policyId, organizationId: principal.organizationId },
          });
          if (policy?.revocationDisposition !== disposition) {
            throw new ApplicationError('CONFLICT_UNSUPPORTED_RESOURCE_STATE', 409, {
              reason: 'LOCATION_REVOCATION_DISPOSITION_MISMATCH',
            });
          }
          const now = this.clock.now();
          const changed = await transaction.locationConsent.updateMany({
            where: { id: consent.id, version: consent.version, status: 'ACTIVE' },
            data: { status: 'REVOKED', revokedAt: now, version: consent.version + 1 },
          });
          if (changed.count !== 1) throw this.versionMismatch(consent.version, consent.version + 1);
          const revoked = await transaction.locationConsent.findUniqueOrThrow({
            where: { id: consent.id },
          });
          await this.appendConsentEvent(transaction, revoked, principal, facts, 'REVOKED');
          await this.appendConsentEvidence(transaction, revoked, principal, facts);

          const tracks = await transaction.locationTrack.findMany({
            where: { consentId: consent.id, organizationId: principal.organizationId },
            select: { id: true, sessionId: true, policyVersion: true },
          });
          for (const track of tracks) {
            await this.interruptSessionTrack(transaction, track.sessionId, {
              code: 'CONSENT_REVOKED',
              actorUserId: principal.userId,
              actorRole: principal.role,
              authSessionId: principal.sessionId,
              requestId: facts.requestId,
              idempotencyKey: facts.idempotencyKey,
            });
            if (disposition === 'RETAIN_UNTIL_EXPIRY') continue;
            const secretDeletion = await transaction.locationSampleSecret.deleteMany({
              where: { sample: { trackId: track.id } },
            });
            const sampleDeletion = await transaction.locationSample.deleteMany({
              where: { trackId: track.id },
            });
            if (secretDeletion.count > 0 || sampleDeletion.count > 0) {
              await this.appendRetentionEvidence(
                transaction,
                track.id,
                principal.organizationId,
                track.policyVersion,
                'RAW',
                sampleDeletion.count,
                facts.requestId,
                principal,
                facts.idempotencyKey,
              );
            }
            if (disposition === 'DELETE_ALL') {
              const coarseDeletion = await transaction.locationSummary.updateMany({
                where: { trackId: track.id, availability: { not: 'WITHHELD' } },
                data: {
                  availability: 'WITHHELD',
                  coarseRoutePolyline: null,
                  coarseDistanceMeters: null,
                  observedStartAt: null,
                  observedEndAt: null,
                  expiresAt: null,
                  version: { increment: 1 },
                  updatedAt: now,
                },
              });
              if (coarseDeletion.count > 0) {
                await this.appendRetentionEvidence(
                  transaction,
                  track.id,
                  principal.organizationId,
                  track.policyVersion,
                  'COARSE',
                  coarseDeletion.count,
                  facts.requestId,
                  principal,
                  facts.idempotencyKey,
                );
              }
            }
          }
          return this.idempotency.success(this.projectConsent(revoked), {
            principalId: principal.userId,
            authSessionId: principal.sessionId,
            resourceType: 'LOCATION_CONSENT',
            resourceId: revoked.id,
          });
        } catch (error: unknown) {
          if (error instanceof ApplicationError) return this.idempotency.failure(error);
          throw error;
        }
      },
    );
  }

  async interruptSessionTrack(
    transaction: Transaction,
    sessionId: string,
    reason: InterruptSessionTrackReason,
  ): Promise<void> {
    await this.lockTrackBySession(transaction, sessionId, undefined);
    const track = await transaction.locationTrack.findUnique({ where: { sessionId } });
    if (track?.status !== 'COLLECTING') return;
    if (!/^[A-Z][A-Z0-9_]{0,63}$/u.test(reason.code)) {
      throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422);
    }
    const now = this.clock.now();
    const changed = await transaction.locationTrack.updateMany({
      where: { id: track.id, version: track.version, status: 'COLLECTING' },
      data: {
        status: 'INTERRUPTED',
        interruptedAt: now,
        reasonCode: reason.code,
        version: track.version + 1,
        updatedAt: now,
      },
    });
    if (changed.count !== 1) throw this.versionMismatch(track.version, track.version + 1);
    const updated = await transaction.locationTrack.findUniqueOrThrow({ where: { id: track.id } });
    const actor: AuthenticatedPrincipal = {
      userId: reason.actorUserId,
      organizationId: track.organizationId,
      role: reason.actorRole,
      sessionId: reason.authSessionId,
      tokenVersion: 0,
      jti: 'internal-location-interruption',
    };
    const facts = { requestId: reason.requestId, idempotencyKey: reason.idempotencyKey };
    await this.appendTrackEvent(transaction, updated, {
      eventType: 'INTERRUPTED',
      fromStatus: 'COLLECTING',
      toStatus: 'INTERRUPTED',
      actor,
      facts,
      acceptedSampleCount: 0,
      rejectedSampleCount: 0,
      reasonCode: reason.code,
    });
    await this.appendTrackEvidence(transaction, updated, actor, facts, 'INTERRUPTED');
  }

  private async lockLocationState(
    transaction: Transaction,
    principal: AuthenticatedPrincipal,
    context: ExerciseSessionPolicyContext,
  ): Promise<{
    session: Awaited<ReturnType<Transaction['exerciseSession']['findFirstOrThrow']>>;
    track: LocationTrack;
    consent: LocationConsent;
    policy: LocationPrivacyPolicy;
  }> {
    await this.lockSession(transaction, context.sessionId, principal.organizationId);
    const session = await transaction.exerciseSession.findFirst({
      where: { id: context.sessionId, organizationId: principal.organizationId },
    });
    if (
      session?.studentId !== context.studentId ||
      session?.enrollmentId !== context.enrollmentId ||
      session?.classSectionId !== context.classSectionId
    ) {
      throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    }
    const candidate = await transaction.locationTrack.findUnique({
      where: { sessionId: session.id },
    });
    if (candidate?.organizationId !== principal.organizationId) {
      throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    }
    await this.lockPolicy(transaction, candidate.policyId, principal.organizationId);
    await this.lockConsent(transaction, candidate.consentId, principal.organizationId);
    await this.lockTrackBySession(transaction, session.id, principal.organizationId);
    const [policy, consent, track] = await Promise.all([
      transaction.locationPrivacyPolicy.findFirst({
        where: { id: candidate.policyId, organizationId: principal.organizationId },
      }),
      transaction.locationConsent.findFirst({
        where: { id: candidate.consentId, organizationId: principal.organizationId },
      }),
      transaction.locationTrack.findUnique({ where: { sessionId: session.id } }),
    ]);
    if (policy === null || consent === null || track === null) {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
        invariant: 'LOCATION_TRACK_BINDINGS_REQUIRED',
      });
    }
    return { session, track, consent, policy };
  }

  private async consentForStart(
    transaction: Transaction,
    principal: AuthenticatedPrincipal,
    studentId: string,
    policy: LocationPrivacyPolicy,
    facts: LocationMutationFacts,
  ): Promise<LocationConsent> {
    await this.lockConsentByStudent(transaction, principal.organizationId, studentId);
    const existing = await transaction.locationConsent.findUnique({
      where: {
        organizationId_studentId_purposeCode: {
          organizationId: principal.organizationId,
          studentId,
          purposeCode: PURPOSE_CODE,
        },
      },
    });
    const now = this.clock.now();
    let consent: LocationConsent;
    if (existing === null) {
      consent = await transaction.locationConsent.create({
        data: {
          id: this.ids.next(),
          organizationId: principal.organizationId,
          studentId,
          purposeCode: PURPOSE_CODE,
          status: 'ACTIVE',
          policyId: policy.id,
          policyVersion: policy.policyVersion,
          consentedAt: now,
          revokedAt: null,
          version: 1,
        },
      });
    } else if (
      existing.status === 'ACTIVE' &&
      existing.policyId === policy.id &&
      existing.policyVersion === policy.policyVersion
    ) {
      return existing;
    } else {
      const changed = await transaction.locationConsent.updateMany({
        where: { id: existing.id, version: existing.version },
        data: {
          status: 'ACTIVE',
          policyId: policy.id,
          policyVersion: policy.policyVersion,
          consentedAt: now,
          revokedAt: null,
          version: existing.version + 1,
        },
      });
      if (changed.count !== 1) throw this.versionMismatch(existing.version, existing.version + 1);
      consent = await transaction.locationConsent.findUniqueOrThrow({
        where: { id: existing.id },
      });
    }
    await this.appendConsentEvent(transaction, consent, principal, facts, 'CONSENTED');
    await this.appendConsentEvidence(transaction, consent, principal, facts);
    return consent;
  }

  private completePolicy(policy: LocationPrivacyPolicy): CompleteStoredPolicy {
    const evaluation = evaluateLocationPolicy({
      policyVersion: policy.policyVersion,
      collectionEnabled: policy.collectionEnabled,
      purposeCode: policy.purposeCode as typeof PURPOSE_CODE,
      sampleIntervalSeconds: policy.sampleIntervalSeconds,
      maximumAccuracyMeters: policy.maximumAccuracyMeters,
      rawRetentionDays: policy.rawRetentionDays,
      coarseRetentionDays: policy.coarseRetentionDays,
      coarseProjectionMeters: policy.coarseProjectionMeters,
      effectiveAt: policy.effectiveAt,
    });
    if (evaluation.state !== 'ENABLED') {
      throw new ApplicationError('CONFLICT_UNSUPPORTED_RESOURCE_STATE', 409, {
        reason:
          evaluation.state === 'DISABLED'
            ? 'LOCATION_COLLECTION_DISABLED'
            : 'LOCATION_POLICY_INCOMPLETE',
        missingParameters: evaluation.missingParameters,
        invalidParameters: evaluation.invalidParameters,
      });
    }
    if (
      policy.revocationDisposition === null ||
      !LOCATION_REVOCATION_DISPOSITIONS.includes(
        policy.revocationDisposition as LocationRevocationDisposition,
      ) ||
      evaluation.policy.coarseRetentionDays < evaluation.policy.rawRetentionDays
    ) {
      throw new ApplicationError('CONFLICT_UNSUPPORTED_RESOURCE_STATE', 409, {
        reason: 'LOCATION_POLICY_INCOMPLETE',
      });
    }
    return {
      policy: evaluation.policy,
      revocationDisposition: policy.revocationDisposition as LocationRevocationDisposition,
    };
  }

  private fingerprintedSample(
    input: AppendLocationSamplesInput['samples'][number],
  ): FingerprintedLocationSample {
    const observedAt = new Date(input.observedAt);
    const sample: LocationSampleObservation = {
      sampleId: input.sampleId,
      observedAt,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracyMeters: input.accuracyMeters,
      ...(input.altitudeMeters === undefined ? {} : { altitudeMeters: input.altitudeMeters }),
      ...(input.speedMillimetersPerSecond === undefined
        ? {}
        : { speedMillimetersPerSecond: input.speedMillimetersPerSecond }),
    };
    const structurallyValid =
      UUID_PATTERN.test(input.sampleId) &&
      Number.isFinite(observedAt.getTime()) &&
      Number.isFinite(input.latitude) &&
      Number.isFinite(input.longitude) &&
      Number.isSafeInteger(input.accuracyMeters) &&
      (input.altitudeMeters === undefined || Number.isSafeInteger(input.altitudeMeters)) &&
      (input.speedMillimetersPerSecond === undefined ||
        Number.isSafeInteger(input.speedMillimetersPerSecond));
    return {
      sample,
      fingerprint: structurallyValid ? this.sampleFingerprint.fingerprint(sample) : 'invalid',
    };
  }

  private async appendConsentEvent(
    transaction: Transaction,
    consent: LocationConsent,
    principal: AuthenticatedPrincipal,
    facts: LocationMutationFacts,
    eventType: 'CONSENTED' | 'REVOKED',
  ): Promise<void> {
    await transaction.locationConsentEvent.create({
      data: {
        id: this.ids.next(),
        organizationId: consent.organizationId,
        consentId: consent.id,
        eventType,
        policyVersion: consent.policyVersion,
        actorUserId: principal.userId,
        authSessionId: principal.sessionId,
        requestId: facts.requestId,
        idempotencyKeyReference: this.keyReference(facts.idempotencyKey),
        eventVersion: consent.version,
        occurredAt: this.clock.now(),
      },
    });
  }

  private async appendConsentEvidence(
    transaction: Transaction,
    consent: LocationConsent,
    principal: AuthenticatedPrincipal,
    facts: LocationMutationFacts,
  ): Promise<void> {
    await this.appendAudit(transaction, 'LOCATION_CONSENT_CHANGED', {
      organizationId: consent.organizationId,
      actor: principal,
      permissionId: 'LOCATION-CONSENT-INTERNAL',
      targetType: 'LOCATION_CONSENT',
      targetId: consent.id,
      facts,
    });
    await this.outbox.append(transaction, {
      organizationId: consent.organizationId,
      aggregateType: 'LOCATION_CONSENT',
      aggregateId: consent.id,
      eventType: 'LOCATION_CONSENT_CHANGED_V1',
      eventVersion: consent.version,
      payload: {
        consentId: consent.id,
        policyVersion: consent.policyVersion,
        status: consent.status,
        version: consent.version,
        requestId: facts.requestId,
      },
    });
  }

  private async appendTrackEvent(
    transaction: Transaction,
    track: LocationTrack,
    input: {
      eventType: 'STARTED' | 'SAMPLES_APPENDED' | 'FINALIZED' | 'INTERRUPTED';
      fromStatus: string | null;
      toStatus: string;
      actor: AuthenticatedPrincipal;
      facts: LocationMutationFacts;
      acceptedSampleCount: number;
      rejectedSampleCount: number;
      reasonCode?: string;
    },
  ): Promise<void> {
    await transaction.locationTrackEvent.create({
      data: {
        id: this.ids.next(),
        organizationId: track.organizationId,
        trackId: track.id,
        eventType: input.eventType,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        actorUserId: input.actor.userId,
        authSessionId: input.actor.sessionId,
        requestId: input.facts.requestId,
        idempotencyKeyReference: this.keyReference(input.facts.idempotencyKey),
        eventVersion: track.version,
        acceptedSampleCount: input.acceptedSampleCount,
        rejectedSampleCount: input.rejectedSampleCount,
        reasonCode: input.reasonCode ?? null,
        occurredAt: this.clock.now(),
      },
    });
  }

  private async appendTrackEvidence(
    transaction: Transaction,
    track: LocationTrack,
    principal: AuthenticatedPrincipal,
    facts: LocationMutationFacts,
    event: 'STARTED' | 'SAMPLES_APPENDED' | 'FINALIZED' | 'INTERRUPTED',
    acceptedSampleCount = 0,
    rejectedSampleCount = 0,
  ): Promise<void> {
    await this.appendAudit(transaction, 'LOCATION_TRACK_CHANGED', {
      organizationId: track.organizationId,
      actor: principal,
      permissionId: `LOCATION-TRACK-${event}`,
      targetType: 'LOCATION_TRACK',
      targetId: track.id,
      facts,
    });
    await this.outbox.append(transaction, {
      organizationId: track.organizationId,
      aggregateType: 'LOCATION_TRACK',
      aggregateId: track.id,
      eventType: `LOCATION_TRACK_${event}_V1`,
      eventVersion: track.version,
      payload: {
        trackId: track.id,
        sessionId: track.sessionId,
        status: track.status,
        acceptedSampleCount,
        rejectedSampleCount,
        version: track.version,
        requestId: facts.requestId,
      },
    });
  }

  private async appendRetentionEvidence(
    transaction: Transaction,
    trackId: string,
    organizationId: string,
    policyVersion: string,
    dataClass: 'RAW' | 'COARSE',
    deletedRowCount: number,
    requestId: string,
    principal: AuthenticatedPrincipal,
    idempotencyKey: string | undefined,
  ): Promise<void> {
    await transaction.locationRetentionEvent.create({
      data: {
        id: this.ids.next(),
        organizationId,
        trackId,
        dataClass,
        deletedRowCount,
        policyVersion,
        requestId,
        deletedAt: this.clock.now(),
      },
    });
    const facts = { requestId, idempotencyKey };
    await this.appendAudit(transaction, 'LOCATION_RETENTION_APPLIED', {
      organizationId,
      actor: principal,
      permissionId: 'LOCATION-RETENTION-INTERNAL',
      targetType: 'LOCATION_TRACK',
      targetId: trackId,
      facts,
    });
    await this.outbox.append(transaction, {
      organizationId,
      aggregateType: 'LOCATION_TRACK',
      aggregateId: trackId,
      eventType: `LOCATION_${dataClass}_RETENTION_APPLIED_V1`,
      eventVersion: 1,
      payload: { trackId, dataClass, deletedRowCount, policyVersion, requestId },
    });
  }

  private async appendAudit(
    transaction: Transaction,
    action:
      | 'LOCATION_POLICY_CHANGED'
      | 'LOCATION_CONSENT_CHANGED'
      | 'LOCATION_TRACK_CHANGED'
      | 'LOCATION_RETENTION_APPLIED',
    input: {
      organizationId: string;
      actor: AuthenticatedPrincipal;
      permissionId: string;
      targetType: string;
      targetId: string;
      facts: LocationMutationFacts;
    },
  ): Promise<void> {
    // Migration 0011 admits these action values. The shared compile-time allowlist
    // has not yet exposed them, so this local boundary intentionally sends no
    // metadata until that shared contract is extended.
    await this.audit.append(transaction, {
      organizationId: input.organizationId,
      actorUserId: input.actor.userId,
      actorRoleSnapshot: input.actor.role,
      permissionId: input.permissionId,
      actionType: action,
      targetType: input.targetType,
      targetId: input.targetId,
      requestId: input.facts.requestId,
      idempotencyKeyReference: this.keyReference(input.facts.idempotencyKey),
      outcome: 'SUCCEEDED',
    });
  }

  private projectPolicy(policy: LocationPrivacyPolicy): LocationPrivacyPolicyProjection {
    return {
      organizationId: policy.organizationId,
      policyVersion: policy.policyVersion,
      collectionEnabled: policy.collectionEnabled,
      purposeCode: PURPOSE_CODE,
      sampleIntervalSeconds: policy.sampleIntervalSeconds,
      maximumAccuracyMeters: policy.maximumAccuracyMeters,
      rawRetentionDays: policy.rawRetentionDays,
      coarseRetentionDays: policy.coarseRetentionDays,
      coarseProjectionMeters: policy.coarseProjectionMeters,
      backgroundCollectionEnabled: policy.backgroundCollectionEnabled,
      revocationDisposition:
        policy.revocationDisposition === null
          ? null
          : (policy.revocationDisposition as LocationRevocationDisposition),
      effectiveAt: policy.effectiveAt.toISOString(),
      version: policy.version,
    };
  }

  private projectTrack(track: LocationTrack): LocationTrackProjection {
    if (!['COLLECTING', 'FINALIZED', 'REJECTED', 'DELETED'].includes(track.status)) {
      throw new ApplicationError('CONFLICT_UNSUPPORTED_RESOURCE_STATE', 409);
    }
    return {
      id: track.id,
      sessionId: track.sessionId,
      status: track.status as LocationTrackProjection['status'],
      acceptedSampleCount: track.acceptedSampleCount,
      startedAt: track.startedAt.toISOString(),
      finalizedAt: track.finalizedAt?.toISOString() ?? null,
      policyVersion: track.policyVersion,
      version: track.version,
    };
  }

  private projectSummary(recordId: string, summary: LocationSummary): LocationSummaryProjection {
    return {
      recordId,
      availability: summary.availability as LocationSummaryProjection['availability'],
      precision: 'COARSE',
      coarseRoutePolyline:
        summary.availability === 'AVAILABLE' ? summary.coarseRoutePolyline : null,
      coarseDistanceMeters:
        summary.availability === 'AVAILABLE' ? summary.coarseDistanceMeters : null,
      observedStartAt:
        summary.availability === 'AVAILABLE'
          ? (summary.observedStartAt?.toISOString() ?? null)
          : null,
      observedEndAt:
        summary.availability === 'AVAILABLE'
          ? (summary.observedEndAt?.toISOString() ?? null)
          : null,
      expiresAt:
        summary.availability === 'AVAILABLE' ? (summary.expiresAt?.toISOString() ?? null) : null,
      policyVersion: summary.policyVersion,
    };
  }

  private emptySummary(
    recordId: string,
    availability: 'NOT_COLLECTED' | 'EXPIRED',
    policyVersion: string | null = null,
  ): LocationSummaryProjection {
    return {
      recordId,
      availability,
      precision: 'COARSE',
      coarseRoutePolyline: null,
      coarseDistanceMeters: null,
      observedStartAt: null,
      observedEndAt: null,
      expiresAt: null,
      policyVersion,
    };
  }

  private projectConsent(consent: LocationConsent): LocationConsentProjection {
    if (consent.status !== 'ACTIVE' && consent.status !== 'REVOKED') {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
        invariant: 'LOCATION_CONSENT_STATUS_INVALID',
      });
    }
    return {
      status: consent.status,
      policyVersion: consent.policyVersion,
      consentedAt: consent.consentedAt.toISOString(),
      revokedAt: consent.revokedAt?.toISOString() ?? null,
      version: consent.version,
    };
  }

  private assertRecordScope(
    principal: AuthenticatedPrincipal,
    context: ExerciseRecordPolicyContext,
  ): void {
    if (principal.organizationId !== context.organizationId) {
      throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    }
    if (
      (principal.role === 'STUDENT' && principal.userId !== context.studentUserId) ||
      (principal.role === 'TEACHER' && principal.userId !== context.teacherUserId)
    ) {
      throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    }
  }

  private assertOwnedStudentSession(
    principal: AuthenticatedPrincipal,
    context: ExerciseSessionPolicyContext,
  ): void {
    this.assertStudent(principal);
    if (
      principal.organizationId !== context.organizationId ||
      principal.userId !== context.studentUserId
    ) {
      throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    }
  }

  private assertAdmin(principal: AuthenticatedPrincipal): void {
    if (principal.role !== 'ADMIN') {
      throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    }
  }

  private assertStudent(principal: AuthenticatedPrincipal): void {
    if (principal.role !== 'STUDENT') {
      throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    }
  }

  private assertVersion(currentVersion: number, expectedVersion: number): void {
    if (currentVersion !== expectedVersion) {
      throw this.versionMismatch(expectedVersion, currentVersion);
    }
  }

  private versionMismatch(expectedVersion: number, currentVersion: number): ApplicationError {
    return new ApplicationError('CONFLICT_VERSION_MISMATCH', 409, {
      expectedVersion,
      currentVersion,
    });
  }

  private parseInstant(value: string): Date {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) {
      throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422);
    }
    return parsed;
  }

  private assertClientObservation(value: string, startedAt: Date, now: Date): void {
    const observedAt = this.parseInstant(value);
    if (observedAt < startedAt || observedAt > now) {
      throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422);
    }
  }

  private keyReference(key: string | undefined): string | null {
    return key === undefined ? null : this.digest.digest('idempotency-key-reference', key);
  }

  private async lockLatestPolicy(transaction: Transaction, organizationId: string): Promise<void> {
    await transaction.$queryRaw(
      Prisma.sql`SELECT "id" FROM "location_privacy_policies" WHERE "organization_id" = ${organizationId} ORDER BY "version" DESC LIMIT 1 FOR UPDATE`,
    );
  }

  private async lockPolicy(
    transaction: Transaction,
    policyId: string,
    organizationId: string,
  ): Promise<void> {
    await transaction.$queryRaw(
      Prisma.sql`SELECT "id" FROM "location_privacy_policies" WHERE "id" = ${policyId} AND "organization_id" = ${organizationId} FOR UPDATE`,
    );
  }

  private async lockConsent(
    transaction: Transaction,
    consentId: string,
    organizationId: string,
  ): Promise<void> {
    await transaction.$queryRaw(
      Prisma.sql`SELECT "id" FROM "location_consents" WHERE "id" = ${consentId} AND "organization_id" = ${organizationId} FOR UPDATE`,
    );
  }

  private async lockConsentByStudent(
    transaction: Transaction,
    organizationId: string,
    studentId: string,
  ): Promise<void> {
    await transaction.$queryRaw(
      Prisma.sql`SELECT "id" FROM "location_consents" WHERE "organization_id" = ${organizationId} AND "student_id" = ${studentId} AND "purpose_code" = ${PURPOSE_CODE} FOR UPDATE`,
    );
  }

  private async lockSession(
    transaction: Transaction,
    sessionId: string,
    organizationId: string,
  ): Promise<void> {
    await transaction.$queryRaw(
      Prisma.sql`SELECT "id" FROM "exercise_sessions" WHERE "id" = ${sessionId} AND "organization_id" = ${organizationId} FOR UPDATE`,
    );
  }

  private async lockTrackBySession(
    transaction: Transaction,
    sessionId: string,
    organizationId: string | undefined,
  ): Promise<void> {
    await transaction.$queryRaw(
      organizationId === undefined
        ? Prisma.sql`SELECT "id" FROM "location_tracks" WHERE "session_id" = ${sessionId} FOR UPDATE`
        : Prisma.sql`SELECT "id" FROM "location_tracks" WHERE "session_id" = ${sessionId} AND "organization_id" = ${organizationId} FOR UPDATE`,
    );
  }
}
