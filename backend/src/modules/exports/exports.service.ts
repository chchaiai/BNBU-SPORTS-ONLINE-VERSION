import { Injectable } from '@nestjs/common';

import { ApplicationError } from '../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';

@Injectable()
export class ExportsService {
  deny(principal: AuthenticatedPrincipal): never {
    void principal;
    throw new ApplicationError('SYSTEM_MODE_UNSUPPORTED', 503);
  }
}
