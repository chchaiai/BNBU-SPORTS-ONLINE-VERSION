import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { IdGenerator } from '../time/id-generator.js';
import type { FoundationRequest } from './request-context.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

export function validRequestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value);
}

export function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(private readonly idGenerator: IdGenerator) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const foundationRequest = request as FoundationRequest;
    const supplied = headerValue(request.headers['x-request-id']);
    const existing = foundationRequest.requestId;
    foundationRequest.requestId = validRequestId(existing)
      ? existing
      : validRequestId(supplied)
        ? supplied
        : this.idGenerator.next();
    response.setHeader('X-Request-ID', foundationRequest.requestId);
    next();
  }
}
