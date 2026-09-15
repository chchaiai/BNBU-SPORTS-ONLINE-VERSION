// One bounded mail probe. This does not create a login challenge or alter student accounts.
import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { randomInt, randomUUID } from 'node:crypto';
import { AokSendAuthCodeDeliveryAdapter } from '/app/dist/modules/client-capabilities/aoksend-auth-code-delivery.adapter.js';
import { TencentSesAuthCodeDeliveryAdapter } from '/app/dist/modules/client-capabilities/tencent-ses-auth-code-delivery.adapter.js';

const recipient = process.env.MAIL_PROBE_RECIPIENT;
if (!['1376293426@qq.com', 'u430034003@mail.bnbu.edu.cn'].includes(recipient)) {
  throw new Error('A user-authorized test recipient is required');
}
const mode = process.env.MAIL_PROBE_MODE;
if (!['primary', 'fallback'].includes(mode)) throw new Error('Explicit probe mode required');
const secret = JSON.parse(await readFile('/run/secrets/runtime-aoksend.json', 'utf8'));
const fallback = {
  provider: 'TENCENT_SES', region: 'ap-guangzhou', fromAddress: 'no-reply@verityai.cn',
  replyToAddress: null, templateId: Number(process.env.MAIL_PROBE_SES_TEMPLATE_ID || '56852'),
  templateVariables: { code: 'code', expiryMinutes: process.env.MAIL_PROBE_EXPIRY_VARIABLE || null, purpose: null },
};
const config = {
  provider: 'AOKSEND', appKey: secret.AOKSEND_APP_KEY,
  templateId: process.env.MAIL_PROBE_AOKSEND_TEMPLATE_ID || 'E_154198061747', timeoutMs: 5000, fallback,
};
let primaryAccepted = false;
let fallbackCalled = false;
const primaryFetch = mode === 'fallback'
  ? async () => new Response('', { status: 503 })
  : async (...args) => {
    const response = await fetch(...args);
    try {
      const result = await response.clone().json();
      primaryAccepted = response.ok && result?.code === 200;
      console.log(JSON.stringify({event:'MAIL_PROBE_PRIMARY_RESPONSE',httpStatus:response.status,
        providerCode:Number.isSafeInteger(result?.code)?result.code:null,
        messageId:typeof result?.msg_id==='string' && /^[A-Za-z0-9_-]{1,150}$/.test(result.msg_id)?result.msg_id:null}));
    } catch { console.log(JSON.stringify({event:'MAIL_PROBE_PRIMARY_RESPONSE',httpStatus:response.status,invalidJson:true})); }
    return response;
  };
const ses = new TencentSesAuthCodeDeliveryAdapter(fallback);
const adapter = new AokSendAuthCodeDeliveryAdapter(config, {
  deliver: async message => { fallbackCalled = true; await ses.deliver(message); },
}, primaryFetch);
const deliveryId = `mail-probe-${randomUUID()}`;
try {
  await adapter.deliver({deliveryId,channel:'EMAIL',purpose:'EMAIL_FIRST_BIND',locale:'zh-CN',recipient,
    code:String(randomInt(100000,1000000)),expiresAt:new Date(Date.now()+600000)});
  console.log(JSON.stringify({event:'MAIL_PROBE_RESULT',deliveryId,mode,primaryAccepted,fallbackCalled,accepted:true}));
} catch {
  console.log(JSON.stringify({event:'MAIL_PROBE_RESULT',deliveryId,mode,primaryAccepted,fallbackCalled,accepted:false}));
  process.exitCode=1;
}
