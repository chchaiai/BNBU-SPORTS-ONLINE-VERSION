import { Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import { SecureDigestService } from '../security/secure-digest.service.js';
import { Clock } from '../time/clock.js';
import { RateLimitPort, type RateLimitDecision, type RateLimitRequest } from './rate-limit.port.js';

interface RateLimitRow {
  count: number;
  reset_at: Date;
}

@Injectable()
export class PostgresRateLimitAdapter extends RateLimitPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly digest: SecureDigestService,
    private readonly clock: Clock,
  ) {
    super();
  }

  consume(request: RateLimitRequest): Promise<RateLimitDecision> {
    const now = this.clock.now();
    const resetAt = new Date(now.getTime() + request.windowSeconds * 1_000);
    const scopeDigests = [
      ...new Set(
        request.keys.map((key) =>
          this.digest.digest('rate-limit-scope', `${request.purpose}\0${key}`),
        ),
      ),
    ];

    return this.prisma.$transaction(async (transaction) => {
      await transaction.rateLimitWindow.deleteMany({ where: { resetAt: { lte: now } } });
      let allowed = true;
      let remaining = request.maximumAttempts;
      let retryAfterSeconds = 0;

      for (const scopeDigest of scopeDigests) {
        const rows = await transaction.$queryRaw<RateLimitRow[]>(Prisma.sql`
          INSERT INTO "rate_limit_windows" (
            "purpose",
            "scope_digest",
            "count",
            "reset_at",
            "updated_at"
          ) VALUES (
            ${request.purpose},
            ${scopeDigest},
            1,
            ${resetAt},
            ${now}
          )
          ON CONFLICT ("purpose", "scope_digest") DO UPDATE SET
            "count" = CASE
              WHEN "rate_limit_windows"."reset_at" <= ${now} THEN 1
              ELSE "rate_limit_windows"."count" + 1
            END,
            "reset_at" = CASE
              WHEN "rate_limit_windows"."reset_at" <= ${now} THEN ${resetAt}
              ELSE "rate_limit_windows"."reset_at"
            END,
            "updated_at" = ${now}
          RETURNING "count", "reset_at"
        `);
        const row = rows[0];
        if (row === undefined) {
          throw new Error('RATE_LIMIT_WRITE_DID_NOT_RETURN_A_ROW');
        }
        allowed &&= row.count <= request.maximumAttempts;
        remaining = Math.min(remaining, Math.max(0, request.maximumAttempts - row.count));
        if (row.count > request.maximumAttempts) {
          retryAfterSeconds = Math.max(
            retryAfterSeconds,
            Math.max(1, Math.ceil((row.reset_at.getTime() - now.getTime()) / 1_000)),
          );
        }
      }

      return { allowed, remaining, retryAfterSeconds };
    });
  }
}
