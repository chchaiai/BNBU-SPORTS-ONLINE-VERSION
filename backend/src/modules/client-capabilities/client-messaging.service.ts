import { FeedbackAttachmentsService } from './feedback-attachments.js';
import { Inject, Injectable } from '@nestjs/common';

import { AuditService, type FoundationAuditAction } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import { pagedResult, type PagedResult } from '../../common/http/envelope.interceptor.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { OutboxService } from '../../common/outbox/outbox.service.js';
import { ScopedCursorService } from '../../common/pagination/scoped-cursor.service.js';
import { SecureDigestService } from '../../common/security/secure-digest.service.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import { Prisma } from '../../generated/prisma/client.js';
import type {
  CreateFeedbackRequestDto,
  FeedbackListQueryDto,
  HelpArticleListQueryDto,
  NotificationListQueryDto,
  PushDeviceRegistrationRequestDto,
  UpdateUserPreferencesRequestDto,
} from './client-capabilities.dto.js';
import {
  type ClientPlatform,
  type FeedbackProjection,
  type FeedbackRow,
  type HelpArticleProjection,
  type HelpArticleRow,
  type NotificationProjection,
  type NotificationRow,
  type PushDeviceProjection,
  type PushDeviceRow,
  type UserPreferenceProjection,
  type UserPreferenceRow,
  projectFeedback,
  projectHelpArticle,
  projectNotification,
  projectPushDevice,
  projectUserPreference,
} from './client-messaging.projection.js';
import { PUSH_TOKEN_CIPHER, PushTokenCipher } from './push-token-cipher.js';
import { enrichNotificationHistory } from './notification-history.projection.js';

type Transaction = Prisma.TransactionClient;

// Only these reviewed event families may be projected to students. Historical
// score/conversion notifications remain stored but are not student-visible.
function studentNotificationScope(principal: AuthenticatedPrincipal) {
  return principal.role === 'STUDENT'
    ? {
        notificationType: {
          in: [
            'EXERCISE_RECORD_RESULT',
            'SYSTEM_MODE',
            'COURSE_MEMBERSHIP',
            'EXEMPTION_APPLICATION_RESULT',
            'ACTIVITY_CERTIFICATION_RESULT',
            'RAW_ENDURANCE_RESULT',
            'FEEDBACK_UPDATED',
            'SETTLEMENT_CHANGED',
            'COURSE_DEADLINE_REMINDER',
            'MAKEUP_WINDOW_GRANTED',
            'MAKEUP_WINDOW_REVOKED',
          ],
        },
      }
    : {};
}

export interface ClientMutationFacts {
  requestId: string;
  idempotencyKey: string | undefined;
}

interface CountResult {
  count: number;
}

interface OrganizationDefaultsRow {
  defaultLocale: string;
}

interface NotificationDelegate {
  findMany(input: unknown): Promise<NotificationRow[]>;
  findFirst(input: unknown): Promise<NotificationRow | null>;
  updateMany(input: unknown): Promise<CountResult>;
}

interface PushDeviceDelegate {
  findFirst(input: unknown): Promise<PushDeviceRow | null>;
  create(input: unknown): Promise<PushDeviceRow>;
  updateMany(input: unknown): Promise<CountResult>;
}

interface UserPreferenceDelegate {
  findFirst(input: unknown): Promise<UserPreferenceRow | null>;
  create(input: unknown): Promise<UserPreferenceRow>;
  updateMany(input: unknown): Promise<CountResult>;
}

interface HelpArticleDelegate {
  findMany(input: unknown): Promise<HelpArticleRow[]>;
  findFirst(input: unknown): Promise<HelpArticleRow | null>;
}

interface FeedbackDelegate {
  findMany(input: unknown): Promise<FeedbackRow[]>;
  findFirst(input: unknown): Promise<FeedbackRow | null>;
  create(input: unknown): Promise<FeedbackRow>;
}

interface AppendOnlyDelegate {
  create(input: unknown): Promise<unknown>;
}

interface OrganizationDelegate {
  findUnique(input: unknown): Promise<OrganizationDefaultsRow | null>;
}

interface MessagingStore {
  organization: OrganizationDelegate;
  notification: NotificationDelegate;
  notificationEvent: AppendOnlyDelegate;
  pushDevice: PushDeviceDelegate;
  pushDeviceEvent: AppendOnlyDelegate;
  userPreference: UserPreferenceDelegate;
  userPreferenceEvent: AppendOnlyDelegate;
  helpArticle: HelpArticleDelegate;
  feedback: FeedbackDelegate;
  feedbackEvent: AppendOnlyDelegate;
}

@Injectable()
export class ClientMessagingService {
  constructor(
    private readonly attachments: FeedbackAttachmentsService,
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly digest: SecureDigestService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly cursors: ScopedCursorService,
    @Inject(PUSH_TOKEN_CIPHER)
    private readonly tokenCipher: PushTokenCipher | null,
  ) {}

  async listNotifications(
    principal: AuthenticatedPrincipal,
    input: NotificationListQueryDto,
  ): Promise<PagedResult<NotificationProjection>> {
    const binding = {
      resource: 'NOTIFICATION' as const,
      organizationId: principal.organizationId,
      principalId: principal.userId,
      role: principal.role,
      filters: { unreadOnly: input.unreadOnly ?? null },
      sort: '-createdAt',
      limit: input.limit,
    };
    const position = this.cursors.decode(input.cursor, binding);
    const rows = await this.store(this.prisma).notification.findMany({
      where: {
        organizationId: principal.organizationId,
        recipientUserId: principal.userId,
        ...studentNotificationScope(principal),
        ...(input.unreadOnly === true ? { readAt: null } : {}),
        ...(position === null
          ? {}
          : {
              OR: [
                { createdAt: { lt: new Date(position.value) } },
                { createdAt: new Date(position.value), id: { lt: position.id } },
              ],
            }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    const last = page.at(-1);
    const enriched = await enrichNotificationHistory(this.prisma, page);
    return pagedResult(enriched.map(projectNotification), {
      nextCursor:
        hasMore && last !== undefined
          ? this.cursors.encode(binding, { value: last.createdAt.toISOString(), id: last.id })
          : null,
      hasMore,
      limit: input.limit,
    });
  }

  async markNotificationRead(
    principal: AuthenticatedPrincipal,
    notificationId: string,
    facts: ClientMutationFacts,
  ): Promise<NotificationProjection> {
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'markNotificationRead',
        scope: `${principal.organizationId}:${principal.userId}`,
        key: facts.idempotencyKey,
        request: { notificationId },
        requestId: facts.requestId,
      },
      async (transaction) => {
        const store = this.store(transaction);
        const current = await store.notification.findFirst({
          where: {
            id: notificationId,
            organizationId: principal.organizationId,
            recipientUserId: principal.userId,
            ...studentNotificationScope(principal),
          },
        });
        if (current === null) return this.notFound();
        if (current.readAt !== null) {
          return this.idempotency.success(
            projectNotification((await enrichNotificationHistory(transaction, [current]))[0]!),
            this.references(principal, 'NOTIFICATION', current.id),
          );
        }

        const now = this.clock.now();
        const updated = { ...current, readAt: now, version: current.version + 1 };
        const result = await store.notification.updateMany({
          where: {
            id: current.id,
            organizationId: principal.organizationId,
            recipientUserId: principal.userId,
            ...studentNotificationScope(principal),
            readAt: null,
            version: current.version,
          },
          data: { readAt: now, version: { increment: 1 } },
        });
        if (result.count !== 1) {
          const raced = await store.notification.findFirst({
            where: {
              id: notificationId,
              organizationId: principal.organizationId,
              recipientUserId: principal.userId,
              ...studentNotificationScope(principal),
            },
          });
          if (raced !== null && raced.readAt !== null) {
            return this.idempotency.success(
              projectNotification((await enrichNotificationHistory(transaction, [raced]))[0]!),
              this.references(principal, 'NOTIFICATION', raced.id),
            );
          }
          return this.versionConflict(raced?.version ?? current.version);
        }

        await store.notificationEvent.create({
          data: this.eventData(updated, principal, facts, 'notificationId', 'READ'),
        });
        await this.appendEvidence(transaction, principal, facts, {
          permissionId: 'NOTIFICATION-MARK-READ',
          actionType: 'NOTIFICATION_READ',
          targetType: 'NOTIFICATION',
          targetId: updated.id,
          eventType: 'NOTIFICATION_READ_V1',
          eventVersion: updated.version,
          payload: { notificationId: updated.id, requestId: facts.requestId },
        });
        return this.idempotency.success(
          projectNotification((await enrichNotificationHistory(transaction, [updated]))[0]!),
          this.references(principal, 'NOTIFICATION', updated.id),
        );
      },
    );
  }

  async registerPushDevice(
    principal: AuthenticatedPrincipal,
    input: PushDeviceRegistrationRequestDto,
    facts: ClientMutationFacts,
  ): Promise<PushDeviceProjection> {
    const tokenCipher = this.requiredPushCipher();
    const platform = this.platform(input.platform);
    const registrationTokenHash = this.digest.digest(
      'push-registration-token',
      input.registrationToken,
    );
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'registerPushDevice',
        scope: `${principal.organizationId}:${principal.userId}`,
        key: facts.idempotencyKey,
        request: {
          platform,
          registrationTokenHash,
          appVersion: input.appVersion,
          locale: input.locale,
        },
        requestId: facts.requestId,
      },
      async (transaction) => {
        await this.advisoryLock(transaction, `push-device:${registrationTokenHash}`);
        const store = this.store(transaction);
        const current = await store.pushDevice.findFirst({
          where: { registrationTokenHash },
        });
        if (
          current !== null &&
          (current.organizationId !== principal.organizationId ||
            current.userId !== principal.userId)
        ) {
          return this.idempotency.failure(
            new ApplicationError('CONFLICT_RESOURCE_ALREADY_EXISTS', 409),
            { principalId: principal.userId, authSessionId: principal.sessionId },
          );
        }

        const now = this.clock.now();
        const deviceId = current?.id ?? this.ids.next();
        const registrationTokenCiphertext = tokenCipher.encrypt(input.registrationToken, {
          organizationId: principal.organizationId,
          userId: principal.userId,
          deviceId,
        });
        let device: PushDeviceRow;
        let eventType: 'REGISTERED' | 'REFRESHED';
        if (current === null) {
          device = await store.pushDevice.create({
            data: {
              id: deviceId,
              organizationId: principal.organizationId,
              userId: principal.userId,
              authSessionId: principal.sessionId,
              platform,
              appVersion: input.appVersion,
              locale: input.locale,
              status: 'ACTIVE',
              registrationTokenHash,
              registrationTokenCiphertext,
              encryptionKeyVersion: tokenCipher.keyVersion,
              registeredAt: now,
              updatedAt: now,
              revokedAt: null,
              version: 1,
            },
          });
          eventType = 'REGISTERED';
        } else {
          const updated = {
            ...current,
            authSessionId: principal.sessionId,
            platform,
            appVersion: input.appVersion,
            locale: input.locale,
            status: 'ACTIVE',
            registrationTokenCiphertext,
            encryptionKeyVersion: tokenCipher.keyVersion,
            updatedAt: now,
            revokedAt: null,
            version: current.version + 1,
          };
          const result = await store.pushDevice.updateMany({
            where: {
              id: current.id,
              organizationId: principal.organizationId,
              userId: principal.userId,
              version: current.version,
            },
            data: {
              authSessionId: principal.sessionId,
              platform,
              appVersion: input.appVersion,
              locale: input.locale,
              status: 'ACTIVE',
              registrationTokenCiphertext,
              encryptionKeyVersion: tokenCipher.keyVersion,
              updatedAt: now,
              revokedAt: null,
              version: { increment: 1 },
            },
          });
          if (result.count !== 1) return this.versionConflict(current.version);
          device = updated;
          eventType = 'REFRESHED';
        }

        await store.pushDeviceEvent.create({
          data: this.eventData(device, principal, facts, 'pushDeviceId', eventType),
        });
        await this.appendEvidence(transaction, principal, facts, {
          permissionId: 'PUSH-DEVICE-REGISTER',
          actionType: 'PUSH_DEVICE_REGISTERED',
          targetType: 'PUSH_DEVICE',
          targetId: device.id,
          eventType: `PUSH_DEVICE_${eventType}_V1`,
          eventVersion: device.version,
          payload: { pushDeviceId: device.id, requestId: facts.requestId },
        });
        return this.idempotency.success(
          projectPushDevice(device),
          this.references(principal, 'PUSH_DEVICE', device.id),
        );
      },
    );
  }

  async unregisterPushDevice(
    principal: AuthenticatedPrincipal,
    deviceId: string,
    facts: ClientMutationFacts,
  ): Promise<null> {
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'unregisterPushDevice',
        scope: `${principal.organizationId}:${principal.userId}`,
        key: facts.idempotencyKey,
        request: { deviceId },
        requestId: facts.requestId,
      },
      async (transaction) => {
        const store = this.store(transaction);
        let current = await store.pushDevice.findFirst({
          where: {
            id: deviceId,
            organizationId: principal.organizationId,
            userId: principal.userId,
          },
        });
        if (current === null) return this.notFound();
        await this.advisoryLock(transaction, `push-device:${current.registrationTokenHash}`);
        current = await store.pushDevice.findFirst({
          where: {
            id: deviceId,
            organizationId: principal.organizationId,
            userId: principal.userId,
          },
        });
        if (current === null) return this.notFound();
        if (current.status === 'REVOKED') {
          return this.idempotency.success(
            null,
            this.references(principal, 'PUSH_DEVICE', current.id),
          );
        }

        const now = this.clock.now();
        const revokedRegistrationTokenHash = this.digest.digest(
          'revoked-push-registration-token',
          `${current.id}:${current.registrationTokenHash}:${current.version + 1}`,
        );
        const device = {
          ...current,
          status: 'REVOKED',
          registrationTokenHash: revokedRegistrationTokenHash,
          registrationTokenCiphertext: null,
          revokedAt: now,
          updatedAt: now,
          version: current.version + 1,
        };
        const result = await store.pushDevice.updateMany({
          where: {
            id: current.id,
            organizationId: principal.organizationId,
            userId: principal.userId,
            status: { not: 'REVOKED' },
            version: current.version,
          },
          data: {
            status: 'REVOKED',
            registrationTokenHash: revokedRegistrationTokenHash,
            registrationTokenCiphertext: null,
            revokedAt: now,
            updatedAt: now,
            version: { increment: 1 },
          },
        });
        if (result.count !== 1) return this.versionConflict(current.version);
        await store.pushDeviceEvent.create({
          data: this.eventData(device, principal, facts, 'pushDeviceId', 'REVOKED'),
        });
        await this.appendEvidence(transaction, principal, facts, {
          permissionId: 'PUSH-DEVICE-UNREGISTER',
          actionType: 'PUSH_DEVICE_UNREGISTERED',
          targetType: 'PUSH_DEVICE',
          targetId: device.id,
          eventType: 'PUSH_DEVICE_REVOKED_V1',
          eventVersion: device.version,
          payload: { pushDeviceId: device.id, requestId: facts.requestId },
        });
        return this.idempotency.success(null, this.references(principal, 'PUSH_DEVICE', device.id));
      },
    );
  }

  async getCurrentUserPreferences(
    principal: AuthenticatedPrincipal,
  ): Promise<UserPreferenceProjection> {
    const store = this.store(this.prisma);
    const current = await store.userPreference.findFirst({
      where: { organizationId: principal.organizationId, userId: principal.userId },
    });
    if (current !== null) return projectUserPreference(current);
    const organization = await store.organization.findUnique({
      where: { id: principal.organizationId },
      select: { defaultLocale: true },
    });
    if (organization === null) this.integrity('PRINCIPAL_ORGANIZATION_NOT_FOUND');
    return {
      locale: organization.defaultLocale,
      pushEnabled: false,
      emailEnabled: false,
      version: 1,
    };
  }

  async updateCurrentUserPreferences(
    principal: AuthenticatedPrincipal,
    input: UpdateUserPreferencesRequestDto,
    facts: ClientMutationFacts,
  ): Promise<UserPreferenceProjection> {
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'updateCurrentUserPreferences',
        scope: `${principal.organizationId}:${principal.userId}`,
        key: facts.idempotencyKey,
        request: input,
        requestId: facts.requestId,
      },
      async (transaction) => {
        await this.advisoryLock(
          transaction,
          `user-preference:${principal.organizationId}:${principal.userId}`,
        );
        const store = this.store(transaction);
        const current = await store.userPreference.findFirst({
          where: { organizationId: principal.organizationId, userId: principal.userId },
        });
        const currentVersion = current?.version ?? 1;
        if (input.expectedVersion !== currentVersion) {
          return this.versionConflict(currentVersion, input.expectedVersion);
        }

        const defaultLocale =
          current === null
            ? await this.requiredOrganizationLocale(store, principal.organizationId)
            : current.locale;
        const changedFields = [
          ...(input.locale === defaultLocale ? [] : ['locale']),
          ...(input.pushEnabled === (current?.pushEnabled ?? false) ? [] : ['pushEnabled']),
          ...(input.emailEnabled === (current?.emailEnabled ?? false) ? [] : ['emailEnabled']),
        ];
        if (changedFields.length === 0) {
          const projection =
            current === null
              ? {
                  locale: defaultLocale,
                  pushEnabled: false,
                  emailEnabled: false,
                  version: 1,
                }
              : projectUserPreference(current);
          return this.idempotency.success(projection, {
            principalId: principal.userId,
            authSessionId: principal.sessionId,
            ...(current === null
              ? {}
              : { resourceType: 'USER_PREFERENCE', resourceId: current.id }),
          });
        }

        const now = this.clock.now();
        let preference: UserPreferenceRow;
        if (current === null) {
          preference = await store.userPreference.create({
            data: {
              id: this.ids.next(),
              organizationId: principal.organizationId,
              userId: principal.userId,
              locale: input.locale,
              pushEnabled: input.pushEnabled,
              emailEnabled: input.emailEnabled,
              version: 2,
              createdAt: now,
              updatedAt: now,
            },
          });
        } else {
          preference = {
            ...current,
            locale: input.locale,
            pushEnabled: input.pushEnabled,
            emailEnabled: input.emailEnabled,
            updatedAt: now,
            version: current.version + 1,
          };
          const result = await store.userPreference.updateMany({
            where: {
              id: current.id,
              organizationId: principal.organizationId,
              userId: principal.userId,
              version: current.version,
            },
            data: {
              locale: input.locale,
              pushEnabled: input.pushEnabled,
              emailEnabled: input.emailEnabled,
              updatedAt: now,
              version: { increment: 1 },
            },
          });
          if (result.count !== 1) return this.versionConflict(current.version);
        }

        await store.userPreferenceEvent.create({
          data: {
            id: this.ids.next(),
            organizationId: preference.organizationId,
            userPreferenceId: preference.id,
            actorUserId: principal.userId,
            authSessionId: principal.sessionId,
            requestId: facts.requestId,
            idempotencyKeyReference: this.keyReference(facts.idempotencyKey),
            eventVersion: preference.version,
            changedFields,
            occurredAt: this.clock.now(),
          },
        });
        await this.appendEvidence(transaction, principal, facts, {
          permissionId: 'USER-PREFERENCES-UPDATE',
          actionType: 'USER_PREFERENCES_UPDATED',
          targetType: 'USER_PREFERENCE',
          targetId: preference.id,
          eventType: 'USER_PREFERENCES_UPDATED_V1',
          eventVersion: preference.version,
          payload: { userPreferenceId: preference.id, requestId: facts.requestId },
        });
        return this.idempotency.success(
          projectUserPreference(preference),
          this.references(principal, 'USER_PREFERENCE', preference.id),
        );
      },
    );
  }

  async listHelpArticles(input: HelpArticleListQueryDto): Promise<HelpArticleProjection[]> {
    const now = this.clock.now();
    const rows = await this.store(this.prisma).helpArticle.findMany({
      where: {
        status: 'PUBLISHED',
        publishedAt: { lte: now },
        locale: input.locale,
        ...(input.category === undefined ? {} : { category: input.category }),
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.projectSafeHelpArticle(row));
  }

  async getHelpArticle(articleId: string): Promise<HelpArticleProjection> {
    const row = await this.store(this.prisma).helpArticle.findFirst({
      where: { id: articleId, status: 'PUBLISHED', publishedAt: { lte: this.clock.now() } },
    });
    if (row === null) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    return this.projectSafeHelpArticle(row);
  }

  async createFeedback(
    principal: AuthenticatedPrincipal,
    input: CreateFeedbackRequestDto,
    facts: ClientMutationFacts,
  ): Promise<FeedbackProjection> {
    const clientPlatform =
      input.clientContext?.platform === undefined
        ? null
        : this.platform(input.clientContext.platform);
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'createFeedback',
        scope: `${principal.organizationId}:${principal.userId}`,
        key: facts.idempotencyKey,
        request: {
          category: input.category,
          content: input.content,
          ...(input.attachmentIds?.length ? {attachmentIds: input.attachmentIds} : {}),
          clientContext: {
            platform: clientPlatform,
            appVersion: input.clientContext?.appVersion ?? null,
            osVersion: input.clientContext?.osVersion ?? null,
          },
        },
        requestId: facts.requestId,
      },
      async (transaction) => {
        const now = this.clock.now();
        const feedback = await this.store(transaction).feedback.create({
          data: {
            id: this.ids.next(),
            organizationId: principal.organizationId,
            createdByUserId: principal.userId,
            category: input.category,
            content: input.content,
            status: 'OPEN',
            publicReply: null,
            clientPlatform,
            clientAppVersion: input.clientContext?.appVersion ?? null,
            clientOsVersion: input.clientContext?.osVersion ?? null,
            createdAt: now,
            updatedAt: now,
            version: 1,
          },
        });
        await this.attachments.bind(transaction, principal, feedback.id, input.attachmentIds ?? []);
        await this.store(transaction).feedbackEvent.create({
          data: this.eventData(feedback, principal, facts, 'feedbackId', 'CREATED'),
        });
        await this.appendEvidence(transaction, principal, facts, {
          permissionId: 'FEEDBACK-CREATE',
          actionType: 'FEEDBACK_CREATED',
          targetType: 'FEEDBACK',
          targetId: feedback.id,
          eventType: 'FEEDBACK_CREATED_V1',
          eventVersion: feedback.version,
          payload: { feedbackId: feedback.id, requestId: facts.requestId },
        });
        return this.idempotency.success(
          projectFeedback(feedback),
          this.references(principal, 'FEEDBACK', feedback.id),
        );
      },
    );
  }

  async listFeedback(
    principal: AuthenticatedPrincipal,
    input: FeedbackListQueryDto,
  ): Promise<PagedResult<FeedbackProjection>> {
    const binding = {
      resource: 'FEEDBACK' as const,
      organizationId: principal.organizationId,
      principalId: principal.userId,
      role: principal.role,
      filters: {
        status: input.status ?? null,
        selfOnly: principal.role !== 'ADMIN',
      },
      sort: '-createdAt',
      limit: input.limit,
    };
    const position = this.cursors.decode(input.cursor, binding);
    const rows = await this.store(this.prisma).feedback.findMany({
      where: {
        organizationId: principal.organizationId,
        ...(principal.role === 'ADMIN' ? {} : { createdByUserId: principal.userId }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(position === null
          ? {}
          : {
              OR: [
                { createdAt: { lt: new Date(position.value) } },
                { createdAt: new Date(position.value), id: { lt: position.id } },
              ],
            }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    const last = page.at(-1);
    return pagedResult(page.map(projectFeedback), {
      nextCursor:
        hasMore && last !== undefined
          ? this.cursors.encode(binding, { value: last.createdAt.toISOString(), id: last.id })
          : null,
      hasMore,
      limit: input.limit,
    });
  }

  async getFeedback(
    principal: AuthenticatedPrincipal,
    feedbackId: string,
  ): Promise<FeedbackProjection> {
    const row = await this.store(this.prisma).feedback.findFirst({
      where: {
        id: feedbackId,
        organizationId: principal.organizationId,
        ...(principal.role === 'ADMIN' ? {} : { createdByUserId: principal.userId }),
      },
    });
    if (row === null) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    return projectFeedback(row);
  }

  private store(source: PrismaService | Transaction): MessagingStore {
    return source as unknown as MessagingStore;
  }

  private requiredPushCipher(): PushTokenCipher {
    if (this.tokenCipher === null) {
      throw new ApplicationError('SYSTEM_MODE_UNSUPPORTED', 503, {
        capability: 'PUSH_DEVICE_REGISTRATION',
      });
    }
    return this.tokenCipher;
  }

  private projectSafeHelpArticle(row: HelpArticleRow): HelpArticleProjection {
    if (/<|javascript:|data:text\/html|https?:\/\//iu.test(row.bodyMarkdown)) {
      this.integrity('HELP_ARTICLE_UNSAFE_PERSISTED_CONTENT');
    }
    return projectHelpArticle(row);
  }

  private async requiredOrganizationLocale(
    store: MessagingStore,
    organizationId: string,
  ): Promise<string> {
    const organization = await store.organization.findUnique({
      where: { id: organizationId },
      select: { defaultLocale: true },
    });
    if (organization === null) this.integrity('PRINCIPAL_ORGANIZATION_NOT_FOUND');
    return organization.defaultLocale;
  }

  private eventData(
    aggregate: { id: string; organizationId: string; version: number },
    principal: AuthenticatedPrincipal,
    facts: ClientMutationFacts,
    aggregateIdField: string,
    eventType: string,
  ): Record<string, unknown> {
    return {
      id: this.ids.next(),
      organizationId: aggregate.organizationId,
      [aggregateIdField]: aggregate.id,
      eventVersion: aggregate.version,
      eventType,
      actorUserId: principal.userId,
      authSessionId: principal.sessionId,
      requestId: facts.requestId,
      idempotencyKeyReference: this.keyReference(facts.idempotencyKey),
      occurredAt: this.clock.now(),
    };
  }

  private async appendEvidence(
    transaction: Transaction,
    principal: AuthenticatedPrincipal,
    facts: ClientMutationFacts,
    input: {
      permissionId: string;
      actionType: FoundationAuditAction;
      targetType: string;
      targetId: string;
      eventType: string;
      eventVersion: number;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.audit.append(transaction, {
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      actorRoleSnapshot: principal.role,
      permissionId: input.permissionId,
      actionType: input.actionType,
      targetType: input.targetType,
      targetId: input.targetId,
      requestId: facts.requestId,
      idempotencyKeyReference: this.keyReference(facts.idempotencyKey),
      outcome: 'SUCCEEDED',
    });
    await this.outbox.append(transaction, {
      organizationId: principal.organizationId,
      aggregateType: input.targetType,
      aggregateId: input.targetId,
      eventType: input.eventType,
      eventVersion: input.eventVersion,
      payload: input.payload,
    });
  }

  private references(
    principal: AuthenticatedPrincipal,
    resourceType: string,
    resourceId: string,
  ): {
    principalId: string;
    authSessionId: string;
    resourceType: string;
    resourceId: string;
  } {
    return {
      principalId: principal.userId,
      authSessionId: principal.sessionId,
      resourceType,
      resourceId,
    };
  }

  private keyReference(key: string | undefined): string | null {
    return key === undefined ? null : this.digest.digest('idempotency-key-reference', key);
  }

  private platform(value: string): ClientPlatform {
    if (value === 'ANDROID' || value === 'WEB' || value === 'IOS') return value;
    throw new ApplicationError('VALIDATION_ENUM_UNSUPPORTED', 422);
  }

  private async advisoryLock(transaction: Transaction, key: string): Promise<void> {
    const rows = await transaction.$queryRaw<{ acquired: number }[]>(
      Prisma.sql`SELECT 1::integer AS acquired FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
    );
    if (rows.length !== 1 || rows[0]?.acquired !== 1) {
      this.integrity('CLIENT_CAPABILITY_ADVISORY_LOCK_FAILED');
    }
  }

  private notFound(): ReturnType<IdempotencyService['failure']> {
    return this.idempotency.failure(new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404));
  }

  private versionConflict(
    currentVersion: number,
    expectedVersion?: number,
  ): ReturnType<IdempotencyService['failure']> {
    return this.idempotency.failure(
      new ApplicationError('CONFLICT_VERSION_MISMATCH', 409, {
        currentVersion,
        ...(expectedVersion === undefined ? {} : { expectedVersion }),
      }),
    );
  }

  private integrity(invariant: string): never {
    throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, { invariant });
  }
}
