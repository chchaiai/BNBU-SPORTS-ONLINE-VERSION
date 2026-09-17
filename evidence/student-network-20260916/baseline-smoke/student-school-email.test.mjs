import assert from 'node:assert/strict';
import test from 'node:test';
import { isStudentSchoolEmail, isNewStudentSchoolEmail } from './js/student-school-email.js';
import { joinActions, renderCourseJoinConfirm } from './js/screens/join.js';
import { verificationActions, renderVerificationLogin } from './js/screens/verification.js';
import { bindingActions, renderContactBinding } from './js/screens/binding.js';

const invalid = ['s@mail.bnbu.edu', 's@mail.bnbu.edu.c', 's@bnbu.edu.cn', 'bnbu@example.com',
  's@mail.bnbu.edu.cn.evil.com', 's@other.mail.bnbu.edu.cn', '@mail.bnbu.edu.cn', 's@@mail.bnbu.edu.cn'];

test('new bindings enforce the exact student prefix without blocking legacy login validation', () => {
  assert.equal(isNewStudentSchoolEmail('a123456789@mail.bnbu.edu.cn'), true);
  for (const value of ['s@mail.bnbu.edu.cn','A123456789@mail.bnbu.edu.cn','a12345678@mail.bnbu.edu.cn','a1234567890@mail.bnbu.edu.cn']) {
    assert.equal(isNewStudentSchoolEmail(value), false);
    assert.equal(isStudentSchoolEmail(value), true);
  }
});
test('school domain validation accepts complete addresses and rejects lookalikes', () => {
  for (const email of invalid) assert.equal(isStudentSchoolEmail(email), false, email);
  assert.equal(isStudentSchoolEmail(' S@MAIL.BNBU.EDU.CN '), true);
});
test('login, enrollment and rebind actions reject incomplete domains without a request', async () => {
  let requests = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { requests++; throw new Error('Unexpected request'); };
  try {
    for (const email of invalid) {
      const app = { ui: {}, state: { workspace: { student: {} } }, render() {}, isWriteAllowed: () => true };
      renderVerificationLogin(app); app.ui.verification.contact = email;
      await verificationActions['verification.sendCode'](app);
      assert.match(renderVerificationLogin(app), /ending in @mail\.bnbu\.edu\.cn|以 @mail\.bnbu\.edu\.cn/);
      const course = { real: true };
      app.state.subParams = { course }; renderCourseJoinConfirm(app, { course });
      app.ui.joinConfirm.email = email; await joinActions['joinConfirm.sendEmail'](app);
      assert.match(app.ui.joinConfirm.error, /@mail\.bnbu\.edu\.cn/);
      renderContactBinding(app, { mode: 'changeEmail' }); app.ui.binding.email = email;
      await bindingActions['binding.sendCode'](app);
      assert.equal(app.ui.binding.challengeId, null);
    }
    assert.equal(requests, 0);
  } finally { globalThis.fetch = previousFetch; }
});
