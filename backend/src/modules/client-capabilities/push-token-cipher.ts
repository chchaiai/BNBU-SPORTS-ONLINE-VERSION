import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { ApplicationError } from '../../common/errors/application-error.js';

const ALGORITHM = 'aes-256-gcm';
const NONCE_BYTES = 12;
const FORMAT_VERSION = 'v1';

export const PUSH_TOKEN_CIPHER = Symbol('PUSH_TOKEN_CIPHER');

export interface PushTokenCipherContext {
  organizationId: string;
  userId: string;
  deviceId: string;
}

export class PushTokenCipher {
  private readonly key: Buffer;

  constructor(
    key: Buffer,
    readonly keyVersion: number,
  ) {
    if (key.byteLength !== 32 || !Number.isSafeInteger(keyVersion) || keyVersion < 1) {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
        invariant: 'PUSH_TOKEN_CIPHER_CONFIGURATION_INVALID',
      });
    }
    this.key = Buffer.from(key);
  }

  encrypt(registrationToken: string, context: PushTokenCipherContext): string {
    if (registrationToken.length === 0) {
      throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422);
    }
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, nonce);
    cipher.setAAD(this.additionalAuthenticatedData(context));
    const ciphertext = Buffer.concat([cipher.update(registrationToken, 'utf8'), cipher.final()]);
    const authenticationTag = cipher.getAuthTag();
    return [
      FORMAT_VERSION,
      String(this.keyVersion),
      nonce.toString('base64url'),
      ciphertext.toString('base64url'),
      authenticationTag.toString('base64url'),
    ].join('.');
  }

  decrypt(value: string, context: PushTokenCipherContext): string {
    const [formatVersion, keyVersion, nonce, ciphertext, authenticationTag, extra] =
      value.split('.');
    if (
      formatVersion !== FORMAT_VERSION ||
      keyVersion !== String(this.keyVersion) ||
      nonce === undefined ||
      ciphertext === undefined ||
      authenticationTag === undefined ||
      extra !== undefined
    ) {
      this.invalidCiphertext();
    }

    try {
      const nonceBytes = Buffer.from(nonce, 'base64url');
      const ciphertextBytes = Buffer.from(ciphertext, 'base64url');
      const authenticationTagBytes = Buffer.from(authenticationTag, 'base64url');
      if (
        nonceBytes.byteLength !== NONCE_BYTES ||
        authenticationTagBytes.byteLength !== 16 ||
        nonceBytes.toString('base64url') !== nonce ||
        ciphertextBytes.toString('base64url') !== ciphertext ||
        authenticationTagBytes.toString('base64url') !== authenticationTag
      ) {
        this.invalidCiphertext();
      }
      const decipher = createDecipheriv(ALGORITHM, this.key, nonceBytes);
      decipher.setAAD(this.additionalAuthenticatedData(context));
      decipher.setAuthTag(authenticationTagBytes);
      return Buffer.concat([decipher.update(ciphertextBytes), decipher.final()]).toString('utf8');
    } catch (error: unknown) {
      if (error instanceof ApplicationError) throw error;
      this.invalidCiphertext();
    }
  }

  private invalidCiphertext(): never {
    throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
      invariant: 'PUSH_TOKEN_CIPHERTEXT_INVALID',
    });
  }

  private additionalAuthenticatedData(context: PushTokenCipherContext): Buffer {
    if (
      context.organizationId.length === 0 ||
      context.userId.length === 0 ||
      context.deviceId.length === 0
    ) {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
        invariant: 'PUSH_TOKEN_CIPHER_CONTEXT_INVALID',
      });
    }
    return Buffer.from(
      JSON.stringify({
        purpose: 'PUSH_REGISTRATION_TOKEN',
        organizationId: context.organizationId,
        userId: context.userId,
        deviceId: context.deviceId,
      }),
      'utf8',
    );
  }
}
