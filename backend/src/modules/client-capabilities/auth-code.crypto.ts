import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

const AUTH_CODE_PATTERN = /^\d{4,10}$/;
const ESCROW_FORMAT_VERSION = 'v1';
const AES_256_KEY_BYTES = 32;
const GCM_NONCE_BYTES = 12;

export class AuthCodeCryptoError extends Error {
  constructor(readonly reason: 'INVALID_INPUT' | 'ESCROW_AUTHENTICATION_FAILED') {
    super(
      reason === 'INVALID_INPUT'
        ? 'The authentication-code cryptographic input is invalid.'
        : 'The authentication-result escrow could not be authenticated.',
    );
    this.name = 'AuthCodeCryptoError';
  }
}

export interface AuthCodeCryptoOptions {
  digestKey: Buffer;
  escrowKey: Buffer;
  escrowKeyVersion: number;
}

/**
 * Pure authentication-code cryptography. Callers persist only the returned code digest.
 * The deterministic escrow is intentionally limited to short-lived authentication results.
 */
export class AuthCodeCrypto {
  private readonly digestKey: Buffer;
  private readonly escrowEncryptionKey: Buffer;
  private readonly escrowNonceKey: Buffer;
  private readonly escrowKeyVersion: number;

  constructor(options: AuthCodeCryptoOptions) {
    if (
      options.digestKey.length < AES_256_KEY_BYTES ||
      options.escrowKey.length !== AES_256_KEY_BYTES ||
      !Number.isSafeInteger(options.escrowKeyVersion) ||
      options.escrowKeyVersion < 1
    ) {
      throw new AuthCodeCryptoError('INVALID_INPUT');
    }
    this.digestKey = Buffer.from(options.digestKey);
    this.escrowKeyVersion = options.escrowKeyVersion;
    this.escrowEncryptionKey = this.deriveEscrowSubkey(
      options.escrowKey,
      'encryption',
      options.escrowKeyVersion,
    );
    this.escrowNonceKey = this.deriveEscrowSubkey(
      options.escrowKey,
      'deterministic-nonce',
      options.escrowKeyVersion,
    );
  }

  generateNumericCode(length: number): string {
    if (!Number.isSafeInteger(length) || length < 4 || length > 10) {
      throw new AuthCodeCryptoError('INVALID_INPUT');
    }
    return randomInt(10 ** length)
      .toString()
      .padStart(length, '0');
  }

  digestCode(context: string, code: string): string {
    this.assertContext(context);
    if (!AUTH_CODE_PATTERN.test(code)) throw new AuthCodeCryptoError('INVALID_INPUT');
    return createHmac('sha256', this.digestKey)
      .update('bnbu-auth-code\0v1\0', 'utf8')
      .update(context, 'utf8')
      .update('\0', 'utf8')
      .update(code, 'utf8')
      .digest('hex');
  }

  verifyCode(context: string, code: string, storedDigest: string): boolean {
    if (!AUTH_CODE_PATTERN.test(code) || !/^[0-9a-f]{64}$/.test(storedDigest)) return false;
    try {
      const expected = Buffer.from(this.digestCode(context, code), 'hex');
      const actual = Buffer.from(storedDigest, 'hex');
      return expected.length === actual.length && timingSafeEqual(expected, actual);
    } catch {
      return false;
    }
  }

  encryptAuthResult(context: string, value: unknown): string {
    this.assertContext(context);
    const plaintext = Buffer.from(canonicalJson(value), 'utf8');
    const aad = this.escrowAad(context);
    const nonce = this.deterministicNonce(aad, plaintext);
    const cipher = createCipheriv('aes-256-gcm', this.escrowEncryptionKey, nonce);
    cipher.setAAD(aad);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      ESCROW_FORMAT_VERSION,
      `k${this.escrowKeyVersion}`,
      nonce.toString('base64url'),
      encrypted.toString('base64url'),
      tag.toString('base64url'),
    ].join('.');
  }

  decryptAuthResult<T>(context: string, escrow: string): T {
    this.assertContext(context);
    const [formatVersion, keyVersionText, nonceText, encryptedText, tagText, extra] =
      escrow.split('.');
    if (
      formatVersion !== ESCROW_FORMAT_VERSION ||
      keyVersionText !== `k${this.escrowKeyVersion}` ||
      nonceText === undefined ||
      encryptedText === undefined ||
      tagText === undefined ||
      extra !== undefined
    ) {
      throw new AuthCodeCryptoError('ESCROW_AUTHENTICATION_FAILED');
    }

    try {
      const nonce = Buffer.from(nonceText, 'base64url');
      if (nonce.length !== GCM_NONCE_BYTES) this.escrowFailure();
      const aad = this.escrowAad(context);
      const decipher = createDecipheriv('aes-256-gcm', this.escrowEncryptionKey, nonce);
      decipher.setAAD(aad);
      decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(encryptedText, 'base64url')),
        decipher.final(),
      ]);
      const expectedNonce = this.deterministicNonce(aad, plaintext);
      if (!timingSafeEqual(nonce, expectedNonce)) this.escrowFailure();
      return JSON.parse(plaintext.toString('utf8')) as T;
    } catch (error: unknown) {
      if (error instanceof AuthCodeCryptoError) throw error;
      throw new AuthCodeCryptoError('ESCROW_AUTHENTICATION_FAILED');
    }
  }

  private assertContext(context: string): void {
    if (context.length < 1 || context.length > 512) {
      throw new AuthCodeCryptoError('INVALID_INPUT');
    }
  }

  private deriveEscrowSubkey(masterKey: Buffer, purpose: string, keyVersion: number): Buffer {
    return createHmac('sha256', masterKey)
      .update(`bnbu-auth-result-key\0v1\0${keyVersion}\0${purpose}`, 'utf8')
      .digest();
  }

  private escrowAad(context: string): Buffer {
    return Buffer.from(
      `bnbu-auth-result\0${ESCROW_FORMAT_VERSION}\0k${this.escrowKeyVersion}\0${context}`,
      'utf8',
    );
  }

  private deterministicNonce(aad: Buffer, plaintext: Buffer): Buffer {
    return createHmac('sha256', this.escrowNonceKey)
      .update('bnbu-auth-result-nonce\0v1\0', 'utf8')
      .update(aad)
      .update('\0', 'utf8')
      .update(plaintext)
      .digest()
      .subarray(0, GCM_NONCE_BYTES);
  }

  private escrowFailure(): never {
    throw new AuthCodeCryptoError('ESCROW_AUTHENTICATION_FAILED');
  }
}

function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new AuthCodeCryptoError('INVALID_INPUT');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  if (typeof value !== 'object') throw new AuthCodeCryptoError('INVALID_INPUT');
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new AuthCodeCryptoError('INVALID_INPUT');
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(',')}}`;
}
