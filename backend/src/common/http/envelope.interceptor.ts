import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import type { FoundationRequest } from './request-context.js';

export interface SuccessEnvelope<T> {
  data: T;
  meta: {
    requestId: string;
    pagination?: PaginationMeta;
  };
}

export interface PaginationMeta {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

const PAGED_RESULT = Symbol('PAGED_RESULT');

export interface PagedResult<T> {
  readonly [PAGED_RESULT]: true;
  data: T[];
  pagination: PaginationMeta;
}

export function pagedResult<T>(data: T[], pagination: PaginationMeta): PagedResult<T> {
  return { [PAGED_RESULT]: true, data, pagination };
}

function isPagedResult(value: unknown): value is PagedResult<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    PAGED_RESULT in value &&
    (value as Partial<PagedResult<unknown>>)[PAGED_RESULT] === true
  );
}

@Injectable()
export class EnvelopeInterceptor<T> implements NestInterceptor<
  T | PagedResult<T>,
  SuccessEnvelope<T | T[]>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T | PagedResult<T>>,
  ): Observable<SuccessEnvelope<T | T[]>> {
    const request = context.switchToHttp().getRequest<FoundationRequest>();
    return next.handle().pipe(
      map((result) =>
        isPagedResult(result)
          ? {
              data: result.data,
              meta: { requestId: request.requestId, pagination: result.pagination },
            }
          : { data: result, meta: { requestId: request.requestId } },
      ),
    );
  }
}
