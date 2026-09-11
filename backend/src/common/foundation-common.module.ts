import { Global, Module } from '@nestjs/common';

import { SecureDigestService } from './security/secure-digest.service.js';
import { QrJoinCryptoService } from './security/qr-join-crypto.service.js';
import { ScopedCursorService } from './pagination/scoped-cursor.service.js';
import { Clock, SystemClock } from './time/clock.js';
import { IdGenerator, UuidV7Generator } from './time/id-generator.js';
import { OrganizationTimeService } from './time/organization-time.service.js';

@Global()
@Module({
  providers: [
    { provide: Clock, useClass: SystemClock },
    { provide: IdGenerator, useClass: UuidV7Generator },
    OrganizationTimeService,
    SecureDigestService,
    QrJoinCryptoService,
    ScopedCursorService,
  ],
  exports: [
    Clock,
    IdGenerator,
    OrganizationTimeService,
    SecureDigestService,
    QrJoinCryptoService,
    ScopedCursorService,
  ],
})
export class FoundationCommonModule {}
