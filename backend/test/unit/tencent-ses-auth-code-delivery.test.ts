import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { TencentSesEmailDeliveryConfig } from '../../src/common/config/environment.js';
import { AuthCodeDeliveryUnavailableError } from '../../src/modules/client-capabilities/auth-code-delivery.port.js';
import { TencentSesAuthCodeDeliveryAdapter } from '../../src/modules/client-capabilities/tencent-ses-auth-code-delivery.adapter.js';

const config: TencentSesEmailDeliveryConfig = {
  provider: 'TENCENT_SES',
  region: 'ap-guangzhou',
  fromAddress: 'no-reply@example.test',
  replyToAddress: null,
  templateId: 56_852,
  templateVariables: {
    code: 'code',
    expiryMinutes: 'minutes',
    purpose: 'purpose',
  },
};

const delivery = {
  deliveryId: 'delivery-1',
  purpose: 'EMAIL_FIRST_BIND' as const,
  channel: 'EMAIL' as const,
  recipient: 'student@example.edu',
  locale: 'zh-CN' as const,
  code: '123456',
  expiresAt: new Date(Date.now() + 10 * 60_000),
};

describe('Tencent SES authentication-code delivery', () => {
  it('uses the administrator identity purpose for both locales', async () => {
    const requests: Record<string, unknown>[] = [];
    const adapter = new TencentSesAuthCodeDeliveryAdapter(config, {
      SendEmail: async (request: Record<string, unknown>) => { requests.push(request); return { MessageId: 'synthetic' }; },
    });
    for (const locale of ['zh-CN', 'en'] as const) await adapter.deliver({ ...delivery, purpose: 'ADMIN_IDENTITY_VERIFICATION', locale });
    const purposes = requests.map(request => JSON.parse((request.Template as { TemplateData: string }).TemplateData).purpose);
    assert.deepEqual(purposes, ['管理员身份核验', 'administrator identity verification']);
  });
  it('uses the approved template as a trigger email without exposing provider credentials', async () => {
    const requests: Record<string, unknown>[] = [];
    const client = {
      SendEmail: (request: Record<string, unknown>) => {
        requests.push(request);
        return Promise.resolve({ MessageId: 'synthetic-message-id' });
      },
    };

    await new TencentSesAuthCodeDeliveryAdapter(config, client).deliver(delivery);

    assert.equal(requests.length, 1);
    const request = requests[0];
    assert.ok(request);
    assert.equal(request.FromEmailAddress, config.fromAddress);
    assert.deepEqual(request.Destination, [delivery.recipient]);
    assert.equal(request.TriggerType, 1);
    assert.deepEqual(request.Template, {
      TemplateID: 56_852,
      TemplateData: JSON.stringify({
        code: delivery.code,
        minutes: '10',
        purpose: '邮箱绑定',
      }),
    });
    assert.equal(JSON.stringify(request).includes('secretId'), false);
    assert.equal(JSON.stringify(request).includes('secretKey'), false);
  });

  it('retries with a bound limit and returns a stable unavailable error', async () => {
    let attempts = 0;
    const client = {
      SendEmail: () => {
        attempts += 1;
        return Promise.reject(new Error('synthetic provider detail that must not escape'));
      },
    };

    await assert.rejects(
      new TencentSesAuthCodeDeliveryAdapter(config, client).deliver(delivery),
      (error: unknown) =>
        error instanceof AuthCodeDeliveryUnavailableError &&
        !error.message.includes('synthetic provider detail'),
    );
    assert.equal(attempts, 3);
  });
});
