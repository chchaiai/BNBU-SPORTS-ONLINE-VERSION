import { createCipheriv, createDecipheriv, randomBytes, randomInt } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { Inject, Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import type { RuntimeConfig } from '../config/environment.js';
import { RUNTIME_CONFIG } from '../config/runtime-config.module.js';
import { PrismaService } from '../database/prisma.service.js';
import {
  ApplicationError,
  applicationErrorFromSnapshot,
  type ErrorDetails,
  type FoundationErrorCode,
} from '../errors/application-error.js';
import { SecureDigestService } from '../security/secure-digest.service.js';
import { Clock } from '../time/clock.js';
import { IdGenerator } from '../time/id-generator.js';

const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{1,128}$/;
const MAX_TRANSACTION_ATTEMPTS = 8;

export function isSerializationFailure(error: unknown): boolean {
  // PostgreSQL's adapter can surface a commit failure directly, without P2034.
  if (error instanceof Error && error.name === 'DriverAdapterError') {
    const cause = error.cause;
    return (
      typeof cause === 'object' && cause !== null && Reflect.get(cause, 'originalCode') === '40001'
    );
  }
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2034') return true;
  if (error.code !== 'P2010' || typeof error.meta !== 'object' || error.meta === null) return false;
  if (Reflect.get(error.meta, 'code') === '40001') return true;
  const adapterError = error.meta.driverAdapterError;
  if (typeof adapterError !== 'object' || adapterError === null) return false;
  const cause = (adapterError as Record<string, unknown>).cause;
  return (
    typeof cause === 'object' &&
    cause !== null &&
    (cause as Record<string, unknown>).originalCode === '40001'
  );
}

export function validateIdempotencyKey(key: string | undefined): string {
  if (key === undefined || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new ApplicationError('VALIDATION_FAILED', 422, {
      fieldErrors: [
        {
          field: 'Idempotency-Key',
          code: 'INVALID',
          i18nKey: 'error.validation.failed',
          params: {},
        },
      ],
    });
  }
  return key;
}

export interface IdempotencyInput {
  organizationId: string;
  principalId: string | null;
  authSessionId: string | null;
  operationId: string;
  scope: string;
  key: string | undefined;
  request: unknown;
  requestId: string;
  retrySerializationFailure?: boolean;
}

export interface IdempotentSuccess<T> {
  kind: 'SUCCESS';
  value: T;
  principalId?: string;
  authSessionId?: string;
  resourceType?: string;
  resourceId?: string;
}

export interface IdempotentFailure {
  kind: 'FAILURE';
  error: ApplicationError;
  principalId?: string;
  authSessionId?: string;
}

export type IdempotentOutcome<T> = IdempotentSuccess<T> | IdempotentFailure;

export interface IdempotentStage<T> {
  kind: 'STAGED';
  value: T;
  principalId?: string;
  authSessionId?: string;
  resourceType: string;
  resourceId: string;
}

export interface IdempotencyStageContext {
  isRecovery: boolean;
  resourceType: string | null;
  resourceId: string | null;
}

export interface IdempotencyStageOwner<T> {
  kind: 'OWNER';
  recordId: string;
  leaseOwner: string;
  value: T;
  retrySerializationFailure: boolean;
}

export interface IdempotencyStageReplay<T> {
  kind: 'REPLAY';
  value: T;
}

export type IdempotencyStageReservation<TStage, TResponse> =
  IdempotencyStageOwner<TStage> | IdempotencyStageReplay<TResponse>;

interface StoredSuccess<T> {
  kind: 'SUCCESS';
  value: T;
}

interface StoredFailure {
  kind: 'FAILURE';
  error: {
    code: FoundationErrorCode;
    status: number;
    message: string;
    details: ErrorDetails;
  };
}

type StoredOutcome<T> = StoredSuccess<T> | StoredFailure;

type StoredOrStageOwner<TStage, TResponse> =
  { kind: 'STORED'; outcome: StoredOutcome<TResponse> } | IdempotencyStageOwner<TStage>;

export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422);
}

@Injectable()
export class IdempotencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
    private readonly digest: SecureDigestService,
    @Inject(RUNTIME_CONFIG) private readonly config: RuntimeConfig,
  ) {}

  async execute<T>(
    input: IdempotencyInput,
    action: (transaction: Prisma.TransactionClient) => Promise<IdempotentOutcome<T>>,
  ): Promise<T> {
    const narrowedInput = { ...input, key: validateIdempotencyKey(input.key) };
    const stored = await this.withTransactionRetry(
      () => this.executeTransaction(narrowedInput, action),
      input.retrySerializationFailure !== false,
    );
    return this.unwrap(stored);
  }

  /**
   * Commits an idempotency reservation and its durable domain staging record before
   * slow or external work begins. A completed request is replayed without invoking
   * the staging action. An expired owner can be recovered from the persisted
   * resource reference without creating a second domain record.
   */
  async reserveStage<TStage, TResponse>(
    input: IdempotencyInput,
    action: (
      transaction: Prisma.TransactionClient,
      context: IdempotencyStageContext,
    ) => Promise<IdempotentStage<TStage> | IdempotentFailure>,
  ): Promise<IdempotencyStageReservation<TStage, TResponse>> {
    const narrowedInput = { ...input, key: validateIdempotencyKey(input.key) };
    const result = await this.withTransactionRetry<StoredOrStageOwner<TStage, TResponse>>(
      () => this.reserveStageTransaction<TStage, TResponse>(narrowedInput, action),
      input.retrySerializationFailure !== false,
    );
    if (result.kind === 'OWNER') return result;
    return { kind: 'REPLAY', value: this.unwrap(result.outcome) };
  }

  /** Completes a previously committed staged reservation and stores its exact response. */
  async completeStage<T>(
    owner: IdempotencyStageOwner<unknown>,
    action: (transaction: Prisma.TransactionClient) => Promise<IdempotentOutcome<T>>,
  ): Promise<T> {
    const stored = await this.withTransactionRetry(
      () => this.completeStageTransaction(owner, action),
      owner.retrySerializationFailure,
    );
    return this.unwrap(stored);
  }

  private async withTransactionRetry<T>(
    operation: () => Promise<T>,
    retrySerializationFailure: boolean,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await operation();
      } catch (error: unknown) {
        lastError = error;
        const uniqueReservationRace =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          attempt === 0;
        const serializationRace =
          retrySerializationFailure &&
          isSerializationFailure(error) &&
          attempt + 1 < MAX_TRANSACTION_ATTEMPTS;
        if (!uniqueReservationRace && !serializationRace) throw error;
        // Wait after the rolled-back transaction has released its connection.
        // Jitter prevents concurrent callers from repeatedly retrying together.
        if (serializationRace) {
          const ceilingMs = Math.min(400, 20 * 2 ** attempt);
          await delay(randomInt(Math.ceil(ceilingMs / 2), ceilingMs + 1));
        }
      }
    }
    throw lastError;
  }

  success<T>(
    value: T,
    references: Omit<IdempotentSuccess<T>, 'kind' | 'value'> = {},
  ): IdempotentSuccess<T> {
    return { kind: 'SUCCESS', value, ...references };
  }

  stage<T>(value: T, references: Omit<IdempotentStage<T>, 'kind' | 'value'>): IdempotentStage<T> {
    return { kind: 'STAGED', value, ...references };
  }

  failure(
    error: ApplicationError,
    references: Omit<IdempotentFailure, 'kind' | 'error'> = {},
  ): IdempotentFailure {
    return { kind: 'FAILURE', error, ...references };
  }

  private async executeTransaction<T>(
    input: IdempotencyInput & { key: string },
    action: (transaction: Prisma.TransactionClient) => Promise<IdempotentOutcome<T>>,
  ): Promise<StoredOutcome<T>> {
    const scopeHash = this.digest.digest(
      'idempotency-scope',
      `${input.operationId}\0${input.scope}`,
    );
    const keyHash = this.digest.digest('idempotency-key', input.key);
    const requestHash = this.digest.digest(
      'idempotency-request',
      `${input.operationId}\0${canonicalJson(input.request)}`,
    );
    const now = this.clock.now();
    const leaseExpiresAt = new Date(now.getTime() + this.config.idempotencyLeaseSeconds * 1_000);
    const expiresAt = new Date(now.getTime() + this.config.idempotencyRetentionSeconds * 1_000);
    const leaseOwner = this.idGenerator.next();

    return this.prisma.$transaction(
      async (transaction) => {
        const existing = await transaction.idempotencyRecord.findUnique({
          where: { scopeHash_keyHash: { scopeHash, keyHash } },
        });

        if (existing !== null) {
          if (existing.requestHash !== requestHash) {
            throw new ApplicationError('CONFLICT_IDEMPOTENCY_KEY_REUSED', 409);
          }
          if (existing.status === 'COMPLETED') {
            if (existing.responseBodyEncryptedOrReference === null) {
              throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
                invariant: 'IDEMPOTENCY_COMPLETED_RESPONSE_REQUIRED',
              });
            }
            return this.decrypt<T>(existing.responseBodyEncryptedOrReference);
          }
          throw new ApplicationError('CONFLICT_REQUEST_IN_PROGRESS', 409, {
            retryAfterSeconds: Math.max(
              1,
              Math.ceil(
                ((existing.leaseExpiresAt?.getTime() ?? now.getTime()) - now.getTime()) / 1_000,
              ),
            ),
          });
        }

        const record = await transaction.idempotencyRecord.create({
          data: {
            id: this.idGenerator.next(),
            organizationId: input.organizationId,
            principalId: input.principalId,
            authSessionId: input.authSessionId,
            operationId: input.operationId,
            scopeHash,
            keyHash,
            requestHash,
            status: 'IN_PROGRESS',
            leaseOwner,
            leaseExpiresAt,
            requestId: input.requestId,
            createdAt: now,
            expiresAt,
          },
        });

        const outcome = await action(transaction);
        const stored: StoredOutcome<T> =
          outcome.kind === 'SUCCESS'
            ? { kind: 'SUCCESS', value: outcome.value }
            : {
                kind: 'FAILURE',
                error: {
                  code: outcome.error.code,
                  status: outcome.error.status,
                  message: outcome.error.message,
                  details: outcome.error.details,
                },
              };

        await transaction.idempotencyRecord.update({
          where: { id: record.id },
          data: {
            principalId: outcome.principalId ?? input.principalId,
            authSessionId: outcome.authSessionId ?? input.authSessionId,
            status: 'COMPLETED',
            leaseOwner: null,
            leaseExpiresAt: null,
            responseStatus: outcome.kind === 'SUCCESS' ? 200 : outcome.error.status,
            responseBodyEncryptedOrReference: this.encrypt(stored),
            ...(outcome.kind === 'SUCCESS' &&
            outcome.resourceType !== undefined &&
            outcome.resourceId !== undefined
              ? { resourceType: outcome.resourceType, resourceId: outcome.resourceId }
              : {}),
            completedAt: this.clock.now(),
          },
        });

        return stored;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async reserveStageTransaction<TStage, TResponse>(
    input: IdempotencyInput & { key: string },
    action: (
      transaction: Prisma.TransactionClient,
      context: IdempotencyStageContext,
    ) => Promise<IdempotentStage<TStage> | IdempotentFailure>,
  ): Promise<StoredOrStageOwner<TStage, TResponse>> {
    const { scopeHash, keyHash, requestHash } = this.hashes(input);
    const now = this.clock.now();
    const leaseExpiresAt = new Date(now.getTime() + this.config.idempotencyLeaseSeconds * 1_000);
    const expiresAt = new Date(now.getTime() + this.config.idempotencyRetentionSeconds * 1_000);
    const leaseOwner = this.idGenerator.next();

    return this.prisma.$transaction(
      async (transaction) => {
        const existing = await transaction.idempotencyRecord.findUnique({
          where: { scopeHash_keyHash: { scopeHash, keyHash } },
        });

        if (existing !== null) {
          if (existing.requestHash !== requestHash) {
            throw new ApplicationError('CONFLICT_IDEMPOTENCY_KEY_REUSED', 409);
          }
          if (existing.status === 'COMPLETED') {
            if (existing.responseBodyEncryptedOrReference === null) {
              throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
                invariant: 'IDEMPOTENCY_COMPLETED_RESPONSE_REQUIRED',
              });
            }
            return {
              kind: 'STORED',
              outcome: this.decrypt<TResponse>(existing.responseBodyEncryptedOrReference),
            };
          }
          if (existing.status !== 'IN_PROGRESS') {
            throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
              invariant: 'IDEMPOTENCY_STAGE_STATUS_INVALID',
            });
          }
          if (existing.leaseExpiresAt === null || existing.leaseOwner === null) {
            throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
              invariant: 'IDEMPOTENCY_STAGE_LEASE_REQUIRED',
            });
          }
          if (existing.leaseExpiresAt.getTime() > now.getTime()) {
            throw new ApplicationError('CONFLICT_REQUEST_IN_PROGRESS', 409, {
              retryAfterSeconds: Math.max(
                1,
                Math.ceil((existing.leaseExpiresAt.getTime() - now.getTime()) / 1_000),
              ),
            });
          }
          const claimed = await transaction.idempotencyRecord.updateMany({
            where: {
              id: existing.id,
              status: 'IN_PROGRESS',
              leaseOwner: existing.leaseOwner,
            },
            data: {
              principalId: input.principalId,
              authSessionId: input.authSessionId,
              leaseOwner,
              leaseExpiresAt,
              requestId: input.requestId,
            },
          });
          if (claimed.count !== 1) {
            throw new ApplicationError('CONFLICT_REQUEST_IN_PROGRESS', 409, {
              retryAfterSeconds: this.config.idempotencyLeaseSeconds,
            });
          }
          const outcome = await action(transaction, {
            isRecovery: true,
            resourceType: existing.resourceType,
            resourceId: existing.resourceId,
          });
          return this.finishReservation<TStage, TResponse>(
            transaction,
            input,
            existing.id,
            leaseOwner,
            outcome,
          );
        }

        const record = await transaction.idempotencyRecord.create({
          data: {
            id: this.idGenerator.next(),
            organizationId: input.organizationId,
            principalId: input.principalId,
            authSessionId: input.authSessionId,
            operationId: input.operationId,
            scopeHash,
            keyHash,
            requestHash,
            status: 'IN_PROGRESS',
            leaseOwner,
            leaseExpiresAt,
            requestId: input.requestId,
            createdAt: now,
            expiresAt,
          },
        });
        const outcome = await action(transaction, {
          isRecovery: false,
          resourceType: null,
          resourceId: null,
        });
        return this.finishReservation<TStage, TResponse>(
          transaction,
          input,
          record.id,
          leaseOwner,
          outcome,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async finishReservation<TStage, TResponse>(
    transaction: Prisma.TransactionClient,
    input: IdempotencyInput,
    recordId: string,
    leaseOwner: string,
    outcome: IdempotentStage<TStage> | IdempotentFailure,
  ): Promise<StoredOrStageOwner<TStage, TResponse>> {
    if (outcome.kind === 'FAILURE') {
      const stored = this.storedOutcome<TResponse>(outcome);
      await this.completeRecord(transaction, recordId, leaseOwner, input, outcome, stored);
      return { kind: 'STORED', outcome: stored };
    }
    const claimed = await transaction.idempotencyRecord.updateMany({
      where: { id: recordId, status: 'IN_PROGRESS', leaseOwner },
      data: {
        principalId: outcome.principalId ?? input.principalId,
        authSessionId: outcome.authSessionId ?? input.authSessionId,
        resourceType: outcome.resourceType,
        resourceId: outcome.resourceId,
      },
    });
    if (claimed.count !== 1) {
      throw new ApplicationError('CONFLICT_REQUEST_IN_PROGRESS', 409, {
        retryAfterSeconds: this.config.idempotencyLeaseSeconds,
      });
    }
    return {
      kind: 'OWNER',
      recordId,
      leaseOwner,
      value: outcome.value,
      retrySerializationFailure: input.retrySerializationFailure !== false,
    };
  }

  private async completeStageTransaction<T>(
    owner: IdempotencyStageOwner<unknown>,
    action: (transaction: Prisma.TransactionClient) => Promise<IdempotentOutcome<T>>,
  ): Promise<StoredOutcome<T>> {
    return this.prisma.$transaction(
      async (transaction) => {
        const existing = await transaction.idempotencyRecord.findUnique({
          where: { id: owner.recordId },
        });
        if (existing === null) {
          throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
            invariant: 'IDEMPOTENCY_STAGE_RECORD_REQUIRED',
          });
        }
        if (existing.status === 'COMPLETED') {
          if (existing.responseBodyEncryptedOrReference === null) {
            throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
              invariant: 'IDEMPOTENCY_COMPLETED_RESPONSE_REQUIRED',
            });
          }
          return this.decrypt<T>(existing.responseBodyEncryptedOrReference);
        }
        if (existing.status !== 'IN_PROGRESS' || existing.leaseOwner !== owner.leaseOwner) {
          throw new ApplicationError('CONFLICT_REQUEST_IN_PROGRESS', 409, {
            retryAfterSeconds: this.config.idempotencyLeaseSeconds,
          });
        }
        const outcome = await action(transaction);
        const stored = this.storedOutcome(outcome);
        await this.completeRecord(
          transaction,
          existing.id,
          owner.leaseOwner,
          {
            principalId: existing.principalId,
            authSessionId: existing.authSessionId,
          },
          outcome,
          stored,
        );
        return stored;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async completeRecord<T>(
    transaction: Prisma.TransactionClient,
    recordId: string,
    leaseOwner: string,
    input: Pick<IdempotencyInput, 'principalId' | 'authSessionId'>,
    outcome: IdempotentOutcome<T>,
    stored: StoredOutcome<T>,
  ): Promise<void> {
    const completed = await transaction.idempotencyRecord.updateMany({
      where: { id: recordId, status: 'IN_PROGRESS', leaseOwner },
      data: {
        principalId: outcome.principalId ?? input.principalId,
        authSessionId: outcome.authSessionId ?? input.authSessionId,
        status: 'COMPLETED',
        leaseOwner: null,
        leaseExpiresAt: null,
        responseStatus: outcome.kind === 'SUCCESS' ? 200 : outcome.error.status,
        responseBodyEncryptedOrReference: this.encrypt(stored),
        ...(outcome.kind === 'SUCCESS' &&
        outcome.resourceType !== undefined &&
        outcome.resourceId !== undefined
          ? { resourceType: outcome.resourceType, resourceId: outcome.resourceId }
          : {}),
        completedAt: this.clock.now(),
      },
    });
    if (completed.count !== 1) {
      throw new ApplicationError('CONFLICT_REQUEST_IN_PROGRESS', 409, {
        retryAfterSeconds: this.config.idempotencyLeaseSeconds,
      });
    }
  }

  private storedOutcome<T>(outcome: IdempotentOutcome<T>): StoredOutcome<T> {
    return outcome.kind === 'SUCCESS'
      ? { kind: 'SUCCESS', value: outcome.value }
      : {
          kind: 'FAILURE',
          error: {
            code: outcome.error.code,
            status: outcome.error.status,
            message: outcome.error.message,
            details: outcome.error.details,
          },
        };
  }

  private hashes(input: IdempotencyInput & { key: string }): {
    scopeHash: string;
    keyHash: string;
    requestHash: string;
  } {
    return {
      scopeHash: this.digest.digest('idempotency-scope', `${input.operationId}\0${input.scope}`),
      keyHash: this.digest.digest('idempotency-key', input.key),
      requestHash: this.digest.digest(
        'idempotency-request',
        `${input.operationId}\0${canonicalJson(input.request)}`,
      ),
    };
  }

  private encrypt(value: unknown): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.config.idempotencyEncryptionKey, nonce);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${nonce.toString('base64url')}.${encrypted.toString('base64url')}.${tag.toString('base64url')}`;
  }

  private decrypt<T>(value: string): StoredOutcome<T> {
    const [version, nonceText, encryptedText, tagText] = value.split('.');
    if (
      version !== 'v1' ||
      nonceText === undefined ||
      encryptedText === undefined ||
      tagText === undefined
    ) {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
        invariant: 'IDEMPOTENCY_RESPONSE_FORMAT_INVALID',
      });
    }

    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.config.idempotencyEncryptionKey,
        Buffer.from(nonceText, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedText, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
      return JSON.parse(decrypted) as StoredOutcome<T>;
    } catch {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
        invariant: 'IDEMPOTENCY_RESPONSE_DECRYPTION_FAILED',
      });
    }
  }

  private unwrap<T>(outcome: StoredOutcome<T>): T {
    if (outcome.kind === 'FAILURE') throw applicationErrorFromSnapshot(outcome.error);
    return outcome.value;
  }
}
