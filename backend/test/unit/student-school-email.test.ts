import 'reflect-metadata';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { isStudentSchoolEmail, isNewStudentSchoolEmail } from '../../src/common/security/student-school-email.js';
import { ClientAuthenticationService } from '../../src/modules/client-capabilities/client-authentication.service.js';
import { EmailVerificationService } from '../../src/modules/users/email-verification.service.js';

const invalid = ['s@mail.bnbu.edu', 's@bnbu.edu.cn', 's@mail.bnbu.edu.cn.evil.com',
  'bnbu@example.com', 's@other.mail.bnbu.edu.cn', '@mail.bnbu.edu.cn',
  's@@mail.bnbu.edu.cn', 's p@mail.bnbu.edu.cn', 's@mail.bnbu.edu.cn.', 's@mail.bnbu.edu.c'];

it('new bindings require a lowercase letter and nine digits while legacy login keeps domain validation', () => {
  assert.equal(isNewStudentSchoolEmail('a123456789@mail.bnbu.edu.cn'), true);
  for (const email of ['A123456789@mail.bnbu.edu.cn', 'a12345678@mail.bnbu.edu.cn', 'a1234567890@mail.bnbu.edu.cn', '1234567890@mail.bnbu.edu.cn', 's@mail.bnbu.edu.cn']) {
    assert.equal(isNewStudentSchoolEmail(email), false);
    assert.equal(isStudentSchoolEmail(email), true);
  }
});

it('new enrollment rejects invalid prefixes before quota, database and delivery', async () => {
  const service = Object.create(ClientAuthenticationService.prototype) as ClientAuthenticationService;
  for (const account of ['s@mail.bnbu.edu.cn','A123456789@mail.bnbu.edu.cn']) {
    await assert.rejects(service.requestStudentSignInCode({ organizationCode:'BNBU-TEST',account,channel:'EMAIL',locale:'en',joinInviteToken:'synthetic' }, {} as never), {code:'VALIDATION_FAILED',status:422});
  }
});

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
