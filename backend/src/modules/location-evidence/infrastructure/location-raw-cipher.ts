import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { ApplicationError } from '../../../common/errors/application-error.js';

const ENVELOPE_VERSION = 'v1';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const BASE64URL = /^[A-Za-z0-9_-]+$/u;

export interface LocationCipherContext {
  organizationId: string;
  trackId: string;
  sampleId: string;
  observedAt: Date;
}

export interface LocationRawPayload {
  latitude: number;
  longitude: number;
  altitudeMeters?: number;
  speedMillimetersPerSecond?: number;
}

function requireFinite(value: number | undefined): void {
  if (value !== undefined && !Number.isFinite(value)) {
    throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422);
  }
}

function validatePayload(payload: LocationRawPayload): void {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof payload.latitude !== 'number' ||
    typeof payload.longitude !== 'number' ||
    (payload.altitudeMeters !== undefined && typeof payload.altitudeMeters !== 'number') ||
    (payload.speedMillimetersPerSecond !== undefined &&
      typeof payload.speedMillimetersPerSecond !== 'number') ||
    Object.keys(payload).some(
      (key) =>
        !['latitude', 'longitude', 'altitudeMeters', 'speedMillimetersPerSecond'].includes(key),
    )
  ) {
    throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422);
  }
  requireFinite(payload.latitude);
  requireFinite(payload.longitude);
  requireFinite(payload.altitudeMeters);
  requireFinite(payload.speedMillimetersPerSecond);
  if (
    payload.latitude < -90 ||
    payload.latitude > 90 ||
    payload.longitude < -180 ||
    payload.longitude > 180
  ) {
    throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422);
  }
}

/** AES-256-GCM envelope for raw coordinates, with row identity bound as AAD. */
export class LocationRawCipher {
  private readonly key: Buffer;

  constructor(
    key: Uint8Array,
    readonly keyVersion: number,
  ) {
    if (key.byteLength !== 32) {
      throw new Error('Location raw encryption key must contain exactly 32 bytes');
    }
    if (!Number.isSafeInteger(keyVersion) || keyVersion < 1) {
      throw new Error('Location raw encryption key version must be a positive integer');
    }
    this.key = Buffer.from(key);
  }

  encrypt(context: LocationCipherContext, payload: LocationRawPayload): string {
    validatePayload(payload);
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    cipher.setAAD(this.additionalAuthenticatedData(context));
    const plaintext = JSON.stringify({
      latitude: payload.latitude,
      longitude: payload.longitude,
      ...(payload.altitudeMeters === undefined ? {} : { altitudeMeters: payload.altitudeMeters }),
      ...(payload.speedMillimetersPerSecond === undefined
        ? {}
        : { speedMillimetersPerSecond: payload.speedMillimetersPerSecond }),
    });
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${ENVELOPE_VERSION}.${this.keyVersion}.${nonce.toString('base64url')}.${encrypted.toString('base64url')}.${tag.toString('base64url')}`;
  }

  decrypt(context: LocationCipherContext, envelope: string): LocationRawPayload {
    const [version, keyVersionText, nonceText, encryptedText, tagText, extra] = envelope.split('.');
    if (
      version !== ENVELOPE_VERSION ||
      keyVersionText !== String(this.keyVersion) ||
      nonceText === undefined ||
      encryptedText === undefined ||
      tagText === undefined ||
      extra !== undefined ||
      !BASE64URL.test(nonceText) ||
      !BASE64URL.test(encryptedText) ||
      !BASE64URL.test(tagText)
    ) {
      this.decryptionFailure();
    }

    try {
      const nonce = Buffer.from(nonceText, 'base64url');
      const encrypted = Buffer.from(encryptedText, 'base64url');
      const tag = Buffer.from(tagText, 'base64url');
      if (
        nonce.byteLength !== NONCE_BYTES ||
        tag.byteLength !== TAG_BYTES ||
        nonce.toString('base64url') !== nonceText ||
        encrypted.toString('base64url') !== encryptedText ||
        tag.toString('base64url') !== tagText
      ) {
        this.decryptionFailure();
      }
      const decipher = createDecipheriv('aes-256-gcm', this.key, nonce);
      decipher.setAAD(this.additionalAuthenticatedData(context));
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
        'utf8',
      );
      const parsed = JSON.parse(plaintext) as LocationRawPayload;
      validatePayload(parsed);
      return parsed;
    } catch (error: unknown) {
      if (
        error instanceof ApplicationError &&
        error.details.invariant === 'LOCATION_RAW_CIPHERTEXT_AUTHENTICATION_FAILED'
      ) {
        throw error;
      }
      this.decryptionFailure();
    }
  }

  private additionalAuthenticatedData(context: LocationCipherContext): Buffer {
    if (
      context.organizationId.length === 0 ||
      context.trackId.length === 0 ||
      context.sampleId.length === 0 ||
      !Number.isFinite(context.observedAt.getTime())
    ) {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
        invariant: 'LOCATION_RAW_CIPHER_CONTEXT_INVALID',
      });
    }
    return Buffer.from(
      `bnbu-location-raw\0v1\0${context.organizationId}\0${context.trackId}\0${context.sampleId}\0${context.observedAt.toISOString()}`,
      'utf8',
    );
  }

  private decryptionFailure(): never {
    throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
      invariant: 'LOCATION_RAW_CIPHERTEXT_AUTHENTICATION_FAILED',
    });
  }
}
