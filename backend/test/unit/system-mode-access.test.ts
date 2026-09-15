import assert from 'node:assert/strict';
import { test } from 'node:test';
import { permitsSystemMode } from '../../src/modules/system-mode/system-mode-access.js';

test('maintenance availability is limited to administrators and unknown modes fail closed', () => {
  for (const role of ['ADMIN', 'TEACHER', 'STUDENT']) {
    assert.equal(permitsSystemMode('NORMAL', role), true);
    assert.equal(permitsSystemMode('MAINTENANCE', role), role === 'ADMIN');
    for (const mode of [undefined, '', 'READ_ONLY']) assert.equal(permitsSystemMode(mode, role), false);
  }
});
