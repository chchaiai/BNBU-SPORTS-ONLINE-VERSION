import assert from 'node:assert/strict';
import test from 'node:test';
import { supportsStudentDevice } from './js/student-device.js';

test('phones and tablets include Android tablets and iPad desktop mode', () => {
  for (const userAgent of ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)', 'Mozilla/5.0 (iPad; CPU OS 18_0)', 'Mozilla/5.0 (Linux; Android 15; Pixel)', 'Mozilla/5.0 (Linux; Android 15; Tablet)']) {
    assert.equal(supportsStudentDevice({userAgent}), true);
  }
  assert.equal(supportsStudentDevice({userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',maxTouchPoints:5}), true);
});

test('desktop and touch laptops remain blocked regardless of narrow viewport', () => {
  for (const userAgent of ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Mozilla/5.0 (X11; Linux x86_64)', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)']) {
    assert.equal(supportsStudentDevice({userAgent,maxTouchPoints:0}), false);
  }
  assert.equal(supportsStudentDevice({userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',maxTouchPoints:10}), false);
});
