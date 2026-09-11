import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  SignJWT,
  errors as joseErrors,
  importPKCS8,
  importSPKI,
  jwtVerify,
  type JWTPayload,
} from 'jose';

import type { RuntimeConfig } from '../../common/config/environment.js';
import { RUNTIME_CONFIG } from '../../common/config/runtime-config.module.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import {
  USER_ROLES,
  type AuthenticatedPrincipal,
  type UserRole,
} from '../../common/http/request-context.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';

const TOKEN_ALGORITHM = 'EdDSA';
const ALLOWED_CLAIMS = new Set([
  'sub',
  'organizationId',
  'role',
  'sessionId',
  'jti',
  'tokenVersion',
  'iss',
  'aud',
  'iat',
  'exp',
]);

export interface IssuedAccessToken {
  token: string;
  expiresAt: Date;
}

@Injectable()
export class TokenService implements OnModuleInit {
  private readonly signingKey: ReturnType<typeof importPKCS8>;
  private readonly verifyingKey: ReturnType<typeof importSPKI>;

  constructor(
    @Inject(RUNTIME_CONFIG) private readonly config: RuntimeConfig,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
  ) {
    this.signingKey = importPKCS8(config.tokenSigningKey, TOKEN_ALGORITHM);
    this.verifyingKey = importSPKI(config.tokenVerifyingKey, TOKEN_ALGORITHM);
  }

  get refreshAbsoluteTtlSeconds(): number {
    return this.config.refreshTokenAbsoluteTtlSeconds;
  }

  get refreshIdleTtlSeconds(): number {
    return this.config.refreshTokenIdleTtlSeconds;
  }

  async onModuleInit(): Promise<void> {
    const nowSeconds = Math.floor(this.clock.now().getTime() / 1_000);
    const probe = await new SignJWT({ probe: true })
      .setProtectedHeader({ alg: TOKEN_ALGORITHM, typ: 'JWT' })
      .setIssuer(this.config.tokenIssuer)
      .setAudience(this.config.tokenAudience)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + 60)
      .sign(await this.signingKey);
    await jwtVerify(probe, await this.verifyingKey, {
      algorithms: [TOKEN_ALGORITHM],
      issuer: this.config.tokenIssuer,
      audience: this.config.tokenAudience,
      currentDate: this.clock.now(),
    });
  }

  async issue(input: {
    userId: string;
    organizationId: string;
    role: UserRole;
    sessionId: string;
    tokenVersion: number;
  }): Promise<IssuedAccessToken> {
    const issuedAt = this.clock.now();
    const issuedAtSeconds = Math.floor(issuedAt.getTime() / 1_000);
    const expiresAt = new Date((issuedAtSeconds + this.config.accessTokenTtlSeconds) * 1_000);
    const jti = this.idGenerator.next();
    const token = await new SignJWT({
      organizationId: input.organizationId,
      role: input.role,
      sessionId: input.sessionId,
      tokenVersion: input.tokenVersion,
    })
      .setProtectedHeader({ alg: TOKEN_ALGORITHM, typ: 'JWT' })
      .setSubject(input.userId)
      .setJti(jti)
      .setIssuer(this.config.tokenIssuer)
      .setAudience(this.config.tokenAudience)
      .setIssuedAt(issuedAtSeconds)
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1_000))
      .sign(await this.signingKey);
    return { token, expiresAt };
  }

  async verify(token: string): Promise<AuthenticatedPrincipal> {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, await this.verifyingKey, {
        algorithms: [TOKEN_ALGORITHM],
        issuer: this.config.tokenIssuer,
        audience: this.config.tokenAudience,
        currentDate: this.clock.now(),
        requiredClaims: [
          'sub',
          'organizationId',
          'role',
          'sessionId',
          'jti',
          'tokenVersion',
          'iat',
          'exp',
        ],
      }));
    } catch (error: unknown) {
      if (error instanceof joseErrors.JWTExpired) {
        throw new ApplicationError('AUTH_TOKEN_EXPIRED', 401);
      }
      throw new ApplicationError('AUTH_TOKEN_INVALID', 401);
    }

    if (Object.keys(payload).some((claim) => !ALLOWED_CLAIMS.has(claim))) {
      throw new ApplicationError('AUTH_TOKEN_INVALID', 401);
    }
    const role = payload.role;
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.organizationId !== 'string' ||
      typeof payload.sessionId !== 'string' ||
      typeof payload.jti !== 'string' ||
      typeof payload.tokenVersion !== 'number' ||
      !Number.isSafeInteger(payload.tokenVersion) ||
      typeof role !== 'string' ||
      !USER_ROLES.includes(role as UserRole)
    ) {
      throw new ApplicationError('AUTH_TOKEN_INVALID', 401);
    }
    return {
      userId: payload.sub,
      organizationId: payload.organizationId,
      role: role as UserRole,
      sessionId: payload.sessionId,
      tokenVersion: payload.tokenVersion,
      jti: payload.jti,
    };
  }
}
