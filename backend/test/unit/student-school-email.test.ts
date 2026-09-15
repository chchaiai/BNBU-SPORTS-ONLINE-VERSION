import 'reflect-metadata';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { isStudentSchoolEmail } from '../../src/common/security/student-school-email.js';
import { ClientAuthenticationService } from '../../src/modules/client-capabilities/client-authentication.service.js';
import { EmailVerificationService } from '../../src/modules/users/email-verification.service.js';

const invalid = ['s@mail.bnbu.edu', 's@bnbu.edu.cn', 's@mail.bnbu.edu.cn.evil.com',
  'bnbu@example.com', 's@other.mail.bnbu.edu.cn', '@mail.bnbu.edu.cn',
  's@@mail.bnbu.edu.cn', 's p@mail.bnbu.edu.cn', 's@mail.bnbu.edu.cn.', 's@mail.bnbu.edu.c'];

it('accepts only the complete student domain, including normalized case and outer spaces', () => {
  for (const email of invalid) assert.equal(isStudentSchoolEmail(email), false, email);
  for (const email of ['s@mail.bnbu.edu.cn', ' S@MAIL.BNBU.EDU.CN ']) assert.equal(isStudentSchoolEmail(email), true);
});

it('rejects invalid login and enrollment email before database, quota, or mail access', async () => {
  const service = Object.create(ClientAuthenticationService.prototype) as ClientAuthenticationService;
  for (const account of invalid) for (const joinInviteToken of [undefined, 'synthetic-invite-token']) {
    await assert.rejects(service.requestStudentSignInCode({ organizationCode: 'BNBU-TEST', account,
      channel: 'EMAIL', locale: 'en', ...(joinInviteToken ? { joinInviteToken } : {}) }, {} as never), { code: 'VALIDATION_FAILED', status: 422 });
  }
});

it('rejects an invalid student rebind before reserving a challenge or calling mail', async () => {
  const service = Object.create(EmailVerificationService.prototype) as EmailVerificationService;
  Object.defineProperty(service, 'prisma', { value: { user: { findFirst: async () => ({ version: 1, status: 'ACTIVE' }) } } });
  for (const email of invalid) await assert.rejects(service.requestChallenge({ role: 'STUDENT' } as never,
    { email, expectedVersion: 1, locale: 'en' }, {} as never), { code: 'VALIDATION_FAILED', status: 422 });
});
