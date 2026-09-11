export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export type RateLimitPurpose = 'AUTHENTICATION' | 'QR_JOIN' | 'CLIENT_DIAGNOSTICS';

export interface RateLimitRequest {
  purpose: RateLimitPurpose;
  keys: readonly string[];
  windowSeconds: number;
  maximumAttempts: number;
}

export abstract class RateLimitPort {
  abstract consume(request: RateLimitRequest): Promise<RateLimitDecision>;
}
