import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type nodemailer from 'nodemailer';

import type { SmtpEmailDeliveryConfig } from '../../src/common/config/environment.js';
import { SmtpAuthCodeDeliveryAdapter } from '../../src/modules/client-capabilities/smtp-auth-code-delivery.adapter.js';

const config: SmtpEmailDeliveryConfig = {
  provider: 'SMTP',
  host: 'smtp.example.test',
  port: 587,
  secure: false,
  username: 'mailer',
  password: 'test-only-password',
  fromAddress: 'no-reply@example.test',
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

describe('SMTP auth-code delivery', () => {
  it('labels administrator identity OTP distinctly in both languages', async () => {
    const messages: Record<string, unknown>[] = [];
    const transport = { sendMail: async (message: Record<string, unknown>) => { messages.push(message); } } as unknown as Pick<nodemailer.Transporter, 'sendMail'>;
    const adapter = new SmtpAuthCodeDeliveryAdapter(config, transport);
    for (const locale of ['zh-CN', 'en'] as const) {
      await adapter.deliver({ ...delivery, purpose: 'ADMIN_IDENTITY_VERIFICATION', locale });
    }
    assert.match(String(messages[0]?.subject), /管理员身份核验/);
    assert.match(String(messages[1]?.subject), /administrator identity verification/);
    assert.ok(messages.every(message => String(message.text).includes(delivery.code)));
  });
  it('retries bounded transient failures and sends the bilingual-safe template', async () => {
    let attempts = 0;
    const sentMessages: Record<string, unknown>[] = [];
    const transport = {
      sendMail: (message: Record<string, unknown>) => {
        attempts += 1;
        sentMessages.push(message);
        if (attempts < 3) return Promise.reject(new Error('synthetic transient failure'));
        return Promise.resolve({ accepted: [delivery.recipient] });
      },
    } as unknown as Pick<nodemailer.Transporter, 'sendMail'>;

    await new SmtpAuthCodeDeliveryAdapter(config, transport).deliver(delivery);

    assert.equal(attempts, 3);
    const lastMessage = sentMessages.at(-1);
    assert.ok(lastMessage);
    assert.equal(lastMessage.to, delivery.recipient);
    assert.match(String(lastMessage.subject), /邮箱绑定验证码/);
    assert.match(String(lastMessage.text), /123456/);
    assert.deepEqual(lastMessage.headers, { 'X-BNBU-Delivery-Id': delivery.deliveryId });
  });

  it('fails after three attempts instead of retrying without a bound', async () => {
    let attempts = 0;
    const transport = {
      sendMail: () => {
        attempts += 1;
        return Promise.reject(new Error('synthetic permanent failure'));
      },
    } as unknown as Pick<nodemailer.Transporter, 'sendMail'>;

    await assert.rejects(
      new SmtpAuthCodeDeliveryAdapter(config, transport).deliver(delivery),
      /synthetic permanent failure/,
    );
    assert.equal(attempts, 3);
  });
});
