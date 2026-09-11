import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AuthenticatedPrincipal, FoundationRequest } from '../http/request-context.js';
import { ApplicationError } from '../errors/application-error.js';

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal => {
    const principal = context.switchToHttp().getRequest<FoundationRequest>().principal;
    if (principal === undefined) throw new ApplicationError('AUTH_REQUIRED', 401);
    return principal;
  },
);
