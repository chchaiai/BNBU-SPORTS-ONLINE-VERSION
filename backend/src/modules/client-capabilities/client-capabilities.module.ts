import { createHmac } from 'node:crypto';

import { Module } from '@nestjs/common';

import { RUNTIME_CONFIG } from '../../common/config/runtime-config.module.js';
import type { RuntimeConfig } from '../../common/config/environment.js';
import { ClientCapabilitiesController } from './client-capabilities.controller.js';
import { ClientErrorReportsController } from './client-error-reports.controller.js';
import { AppReleasePolicyService } from './app-release-policy.service.js';
import { ClientCapabilitiesService } from './client-capabilities.service.js';
import { ClientMessagingService } from './client-messaging.service.js';
import { PUSH_TOKEN_CIPHER, PushTokenCipher } from './push-token-cipher.js';
import { AuthModule } from '../auth/auth.module.js';
import { ClientAuthenticationService } from './client-authentication.service.js';
import { AuthCodeCrypto } from './auth-code.crypto.js';
import {
  AuthCodeDeliveryPort,
  DisabledAuthCodeDeliveryAdapter,
  InMemoryTestAuthCodeDeliveryAdapter,
} from './auth-code-delivery.port.js';
import { ExemptionApplicationsService } from './exemption-applications.service.js';
import { SmtpAuthCodeDeliveryAdapter } from './smtp-auth-code-delivery.adapter.js';
import { TencentSesAuthCodeDeliveryAdapter } from './tencent-ses-auth-code-delivery.adapter.js';

@Module({
  imports: [AuthModule],
  controllers: [ClientCapabilitiesController, ClientErrorReportsController],
  providers: [
    ClientCapabilitiesService,
    ClientAuthenticationService,
    ExemptionApplicationsService,
    AppReleasePolicyService,
    ClientMessagingService,
    {
      provide: AuthCodeCrypto,
      inject: [RUNTIME_CONFIG],
      useFactory: (config: RuntimeConfig): AuthCodeCrypto => {
        const derive = (purpose: string): Buffer =>
          createHmac('sha256', config.securityHashKey).update(`auth-code:${purpose}:v1`).digest();
        return new AuthCodeCrypto({
          digestKey: derive('digest'),
          escrowKey: derive('escrow'),
          escrowKeyVersion: 1,
        });
      },
    },
    {
      provide: AuthCodeDeliveryPort,
      inject: [RUNTIME_CONFIG],
      useFactory: (config: RuntimeConfig): AuthCodeDeliveryPort =>
        config.emailDelivery !== null
          ? config.emailDelivery.provider === 'SMTP'
            ? new SmtpAuthCodeDeliveryAdapter(config.emailDelivery)
            : new TencentSesAuthCodeDeliveryAdapter(config.emailDelivery)
          : config.appEnvironment === 'test'
            ? new InMemoryTestAuthCodeDeliveryAdapter('test')
            : new DisabledAuthCodeDeliveryAdapter(),
    },
    {
      provide: PUSH_TOKEN_CIPHER,
      inject: [RUNTIME_CONFIG],
      useFactory: (config: RuntimeConfig): PushTokenCipher | null =>
        config.push === null
          ? null
          : new PushTokenCipher(
              config.push.registrationTokenEncryptionKey,
              config.push.encryptionKeyVersion,
            ),
    },
  ],
  exports: [AuthCodeCrypto, AuthCodeDeliveryPort],
})
export class ClientCapabilitiesModule {}
