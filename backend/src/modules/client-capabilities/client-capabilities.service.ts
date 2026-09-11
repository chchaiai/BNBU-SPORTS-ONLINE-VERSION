import { Injectable } from '@nestjs/common';

import { ApplicationError } from '../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';

/**
 * Contract-first boundary for client capabilities whose business, privacy, or
 * production rules are not approved yet. Every handler reaches this service
 * only after request validation, authentication, role checks, organization
 * scope, and any available Session/Record ownership resolution.
 */
@Injectable()
export class ClientCapabilitiesService {
  deny(principal?: AuthenticatedPrincipal): never {
    void principal;
    throw new ApplicationError('SYSTEM_MODE_UNSUPPORTED', 503);
  }
}
