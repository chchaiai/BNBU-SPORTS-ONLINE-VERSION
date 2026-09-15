import 'reflect-metadata';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { ClientAuthenticationService } from '../../src/modules/client-capabilities/client-authentication.service.js';

it('suppressed student mail never invokes the external provider; eligible mail invokes it once', async () => {
  const service = Object.create(ClientAuthenticationService.prototype) as object;
  let calls = 0;
  Object.defineProperty(service, 'delivery', { value: { deliver: async () => { calls++; } } });
  const deliver = Reflect.get(service, 'deliver') as (stage: object) => Promise<void>;
  const stage = { purpose: 'STUDENT_SIGN_IN', challengeId: 'synthetic', channel: 'EMAIL',
    recipient: 'synthetic@example.test', locale: 'en', code: '123456', expiresAt: new Date() };
  await deliver.call(service, { ...stage, deliveryAllowed: false });
  assert.equal(calls, 0);
  await deliver.call(service, { ...stage, deliveryAllowed: true });
  assert.equal(calls, 1);
});
