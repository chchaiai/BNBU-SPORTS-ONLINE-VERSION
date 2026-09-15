import { Logger } from '@nestjs/common';
import type { AokSendEmailDeliveryConfig } from '../../common/config/environment.js';
import {
  AuthCodeDeliveryPort,
  AuthCodeDeliveryUnavailableError,
  type AuthCodeDelivery,
} from './auth-code-delivery.port.js';

/** One primary attempt, then SES with the same challenge; a timeout can cause duplicate mail. */
export class AokSendAuthCodeDeliveryAdapter extends AuthCodeDeliveryPort {
  private readonly logger = new Logger(AokSendAuthCodeDeliveryAdapter.name);

  constructor(
    private readonly config: AokSendEmailDeliveryConfig,
    private readonly fallback: AuthCodeDeliveryPort,
    private readonly send: typeof fetch = fetch,
  ) {
    super();
  }

  async deliver(message: AuthCodeDelivery): Promise<void> {
    if (message.channel !== 'EMAIL' || message.expiresAt.getTime() <= Date.now()) {
      throw new AuthCodeDeliveryUnavailableError();
    }
    const startedAt = Date.now();
    let failure = 'NETWORK';
    let providerCode: number | undefined;
    let httpStatus: number | undefined;
    try {
      const response = await this.send('https://apiv2.aoksend.com/index/api/send_email', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(this.config.timeoutMs),
        body: new URLSearchParams({
          app_key: this.config.appKey,
          template_id: this.config.templateId,
          to: message.recipient,
          alias: 'BNBU Sports',
          data: JSON.stringify({
            code: message.code,
            minutes: String(
              Math.max(1, Math.ceil((message.expiresAt.getTime() - Date.now()) / 60000)),
            ),
          }),
        }),
      });
      httpStatus = response.status;
      failure = 'HTTP';
      if (!response.ok) throw new AuthCodeDeliveryUnavailableError();
      failure = 'INVALID_RESPONSE';
      const result: unknown = await response.json();
      if (
        typeof result === 'object' &&
        result !== null &&
        'code' in result &&
        typeof result.code === 'number' &&
        Number.isSafeInteger(result.code)
      ) {
        providerCode = result.code;
        failure = 'PROVIDER_REJECTED';
      }
      if (
        typeof result !== 'object' ||
        result === null ||
        !('code' in result) ||
        result.code !== 200
      ) {
        throw new AuthCodeDeliveryUnavailableError();
      }
      this.logger.log({
        event: 'AUTH_EMAIL_PROVIDER_RESULT',
        deliveryId: message.deliveryId,
        provider: 'AOKSEND',
        outcome: 'ACCEPTED',
        elapsedMs: Date.now() - startedAt,
      });
      return;
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')
      ) {
        failure = 'TIMEOUT';
      }
      // Do not log request bodies, recipient addresses, codes, keys or provider response text.
      this.logger.warn({
        event: 'AUTH_EMAIL_PROVIDER_FALLBACK',
        deliveryId: message.deliveryId,
        primary: 'AOKSEND',
        fallback: 'TENCENT_SES',
        failure,
        httpStatus,
        providerCode,
        elapsedMs: Date.now() - startedAt,
      });
    }
    if (message.expiresAt.getTime() <= Date.now()) throw new AuthCodeDeliveryUnavailableError();
    const fallbackStartedAt = Date.now();
    try {
      await this.fallback.deliver(message);
      this.logger.log({
        event: 'AUTH_EMAIL_PROVIDER_RESULT',
        deliveryId: message.deliveryId,
        provider: 'TENCENT_SES',
        outcome: 'ACCEPTED',
        elapsedMs: Date.now() - fallbackStartedAt,
      });
    } catch {
      this.logger.error({
        event: 'AUTH_EMAIL_PROVIDER_RESULT',
        deliveryId: message.deliveryId,
        provider: 'TENCENT_SES',
        outcome: 'FAILED',
        elapsedMs: Date.now() - fallbackStartedAt,
      });
      throw new AuthCodeDeliveryUnavailableError();
    }
  }
}
