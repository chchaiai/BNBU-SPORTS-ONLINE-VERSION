import { Injectable } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { ApplicationError } from '../errors/application-error.js';
import { Clock } from '../time/clock.js';
import { requestIdFrom } from './request-context.js';

interface BodyParserFailure {
  type?: unknown;
}

@Injectable()
export class BodyParserErrorMiddleware {
  constructor(private readonly clock: Clock) {}

  use(error: unknown, request: Request, response: Response, next: NextFunction): void {
    const type = (error as BodyParserFailure | null)?.type;
    if (type !== 'entity.too.large' && type !== 'entity.parse.failed') {
      next(error);
      return;
    }

    const mapped = new ApplicationError('VALIDATION_FAILED', 422);
    response.status(mapped.status).json({
      code: mapped.code,
      message: mapped.message,
      details: mapped.details,
      requestId: requestIdFrom(request),
      timestamp: this.clock.now().toISOString(),
    });
  }
}
