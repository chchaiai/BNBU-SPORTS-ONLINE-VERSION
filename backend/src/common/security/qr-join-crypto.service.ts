import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { RuntimeConfig } from '../config/environment.js';
import { RUNTIME_CONFIG } from '../config/runtime-config.module.js';
import { ApplicationError } from '../errors/application-error.js';
import { canonicalJson } from '../idempotency/idempotency.service.js';

const TOKEN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CURRENT_KEY_VERSION = 1;

export type QrJoinTokenKind = 'course-invite' | 'join-capability';
export type QrJoinCipherPurpose =
  | 'course-invite-issuance'
  | 'join-capability-issuance'
  | 'join-identity-snapshot'
  | 'join-result-replay';

export interface IssuedQrJoinToken {
  token: string;
  tokenHash: string;
}

export interface ParsedQrJoinToken {
  publicId: string;
  tokenHash: string;
}

@Injectable()
export class QrJoinCryptoService {
  constructor(@Inject(RUNTIME_CONFIG) private readonly config: RuntimeConfig) {}

  get keyVersion(): number {
    return CURRENT_KEY_VERSION;
  }

  issueToken(kind: QrJoinTokenKind, publicId: string): IssuedQrJoinToken {
    if (!TOKEN_ID_PATTERN.test(publicId)) {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
        invariant: 'QR_JOIN_PUBLIC_ID_MUST_BE_UUIDV7',
      });
    }
    const secret = randomBytes(32).toString('base64url');
    return {
      token: `${publicId}.${secret}`,
      tokenHash: this.tokenHash(kind, publicId, secret),
    };
  }

  parseToken(kind: QrJoinTokenKind, token: string): ParsedQrJoinToken | null {
    if (token.length > 512) return null;
    const [publicId, secret, extra] = token.split('.');
    if (
      publicId === undefined ||
      secret === undefined ||
      extra !== undefined ||
      !TOKEN_ID_PATTERN.test(publicId) ||
      !TOKEN_SECRET_PATTERN.test(secret)
    ) {
      return null;
    }
    return { publicId, tokenHash: this.tokenHash(kind, publicId, secret) };
  }

  matches(expectedHash: string, actualHash: string): boolean {
    const expected = Buffer.from(expectedHash, 'hex');
    const actual = Buffer.from(actualHash, 'hex');
    return expected.length === 32 && actual.length === 32 && timingSafeEqual(expected, actual);
  }

  opaqueReference(domain: string, value: string): string {
    return this.hmac(`opaque-reference:${domain}`, value);
  }

  identityFingerprint(value: unknown): string {
    return this.hmac('student-identity-fingerprint', canonicalJson(value));
  }

  encrypt(purpose: QrJoinCipherPurpose, context: string, value: unknown): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.config.qrJoinSecretEncryptionKey, nonce);
    cipher.setAAD(this.additionalAuthenticatedData(purpose, context));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${nonce.toString('base64url')}.${encrypted.toString('base64url')}.${tag.toString('base64url')}`;
  }

  decrypt<T>(purpose: QrJoinCipherPurpose, context: string, value: string): T {
    const [version, nonceText, encryptedText, tagText, extra] = value.split('.');
    if (
      version !== 'v1' ||
      nonceText === undefined ||
      encryptedText === undefined ||
      tagText === undefined ||
      extra !== undefined
    ) {
      this.decryptionFailure();
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.config.qrJoinSecretEncryptionKey,
        Buffer.from(nonceText, 'base64url'),
      );
      decipher.setAAD(this.additionalAuthenticatedData(purpose, context));
      decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(encryptedText, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
      return JSON.parse(plaintext) as T;
    } catch {
      this.decryptionFailure();
    }
  }

  private tokenHash(kind: QrJoinTokenKind, publicId: string, secret: string): string {
    return this.hmac(`token:${kind}`, `${publicId}\0${secret}`);
  }

  private hmac(domain: string, value: string): string {
    return createHmac('sha256', this.config.qrJoinTokenHashKey)
      .update(domain)
      .update('\0')
      .update(value)
      .digest('hex');
  }

  private additionalAuthenticatedData(purpose: QrJoinCipherPurpose, context: string): Buffer {
    return Buffer.from(`bnbu-qr-join\0v1\0${purpose}\0${context}`, 'utf8');
  }

  private decryptionFailure(): never {
    throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
      invariant: 'QR_JOIN_CIPHERTEXT_AUTHENTICATION_FAILED',
    });
  }
}
