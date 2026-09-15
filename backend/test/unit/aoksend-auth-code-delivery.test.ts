import assert from 'node:assert/strict';
import { it } from 'node:test';
import type { AokSendEmailDeliveryConfig } from '../../src/common/config/environment.js';
import { AokSendAuthCodeDeliveryAdapter } from '../../src/modules/client-capabilities/aoksend-auth-code-delivery.adapter.js';
import {
  AuthCodeDeliveryUnavailableError,
  type AuthCodeDelivery,
} from '../../src/modules/client-capabilities/auth-code-delivery.port.js';
import {
  loadRuntimeSecrets,
  RUNTIME_SECRET_KEYS,
} from '../../src/common/config/file-json-secret-loader.js';

const config: AokSendEmailDeliveryConfig = {
  provider: 'AOKSEND',
  appKey: 'synthetic-key',
  templateId: 'synthetic-template',
  timeoutMs: 1000,
  fallback: {
    provider: 'TENCENT_SES',
    region: 'ap-guangzhou',
    fromAddress: 'no-reply@example.test',
    replyToAddress: null,
    templateId: 1,
    templateVariables: { code: 'code', expiryMinutes: 'minutes', purpose: null },
  },
};
const message: AuthCodeDelivery = {
  deliveryId: 'synthetic-delivery',
  purpose: 'STUDENT_SIGN_IN',
  channel: 'EMAIL',
  recipient: 'student@example.test',
  locale: 'zh-CN',
  code: '012345',
  expiresAt: new Date(Date.now() + 600000),
};

it('sends form data to v2, keeps leading zeroes and avoids fallback on acceptance', async () => {
  let fallbackCount = 0;
  const adapter = new AokSendAuthCodeDeliveryAdapter(
    config,
    {
      deliver: () => {
        fallbackCount++;
        return Promise.resolve();
      },
    },
    (url, options) => {
      assert.equal(url, 'https://apiv2.aoksend.com/index/api/send_email');
      assert.equal(options?.redirect, 'error');
      assert.ok(options?.signal);
      const body = options?.body as URLSearchParams;
      assert.equal(body.get('app_key'), config.appKey);
      assert.equal(body.get('template_id'), config.templateId);
      assert.equal(body.get('to'), message.recipient);
      assert.deepEqual(JSON.parse(body.get('data')!), { code: '012345', minutes: '10' });
      return Promise.resolve(Response.json({ code: 200, msg_id: 'synthetic' }));
    },
  );
  await adapter.deliver(message);
  assert.equal(fallbackCount, 0);
});

for (const failure of ['http', 'business', 'malformed', 'network', 'timeout', 'limit'] as const) {
  it(`falls back once with the identical challenge after ${failure} failure`, async () => {
    const received: AuthCodeDelivery[] = [];
    let attempts = 0;
    const adapter = new AokSendAuthCodeDeliveryAdapter(
      config,
      {
        deliver: (value) => {
          received.push(value);
          return Promise.resolve();
        },
      },
      () => {
        attempts++;
        if (failure === 'timeout')
          return Promise.reject(new DOMException('synthetic', 'TimeoutError'));
        if (failure === 'limit') return Promise.resolve(new Response('', { status: 429 }));
        if (failure === 'network') return Promise.reject(new Error('sensitive provider error'));
        if (failure === 'http') return Promise.resolve(new Response('', { status: 503 }));
        if (failure === 'malformed') return Promise.resolve(new Response('invalid JSON'));
        return Promise.resolve(Response.json({ code: 40007 }));
      },
    );
    await adapter.deliver(message);
    assert.equal(attempts, 1);
    assert.deepEqual(received, [message]);
    assert.equal(received[0], message);
  });
}

it('reports failure when both providers fail', async () => {
  const adapter = new AokSendAuthCodeDeliveryAdapter(
    config,
    {
      deliver: () => {
        return Promise.reject(new AuthCodeDeliveryUnavailableError());
      },
    },
    () => {
      return Promise.reject(new Error('synthetic'));
    },
  );
  await assert.rejects(adapter.deliver(message), AuthCodeDeliveryUnavailableError);
});

it('does not send expired codes', async () => {
  const unexpected = (): Promise<never> => {
    assert.fail('provider must not be called');
  };
  await assert.rejects(
    new AokSendAuthCodeDeliveryAdapter(config, { deliver: unexpected }, unexpected).deliver({
      ...message,
      expiresAt: new Date(0),
    }),
    AuthCodeDeliveryUnavailableError,
  );
});

it('requires the AoKSend file secret only when selected, preserving existing SES files', async () => {
  const secrets = Object.fromEntries(
    RUNTIME_SECRET_KEYS.filter((key) => key !== 'AOKSEND_APP_KEY').map((key) => [key, 'synthetic']),
  );
  const environment = {
    APP_ENV: 'production',
    RUNTIME_SECRET_PROVIDER: 'FILE_JSON',
    RUNTIME_SECRET_FILE: '/run/secrets/test.json',
  };
  const deps = { readSecretFile: () => Promise.resolve(Buffer.from(JSON.stringify(secrets))) };
  await loadRuntimeSecrets({ ...environment, EMAIL_DELIVERY_PROVIDER: 'TENCENT_SES' }, deps);
  await assert.rejects(
    loadRuntimeSecrets({ ...environment, EMAIL_DELIVERY_PROVIDER: 'AOKSEND' }, deps),
    /missing keys: AOKSEND_APP_KEY/,
  );
});
