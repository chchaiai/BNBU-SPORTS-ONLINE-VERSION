import assert from 'node:assert/strict';
import {test} from 'node:test';
import {publicErrorDetails} from '../../src/common/errors/application-error.js';
test('swimming errors expose only safe reasons, including nested failures',()=>{
  for(const reason of ['SWIM_INTAKE_REQUIRED','SWIM_BEFORE_AFTER_REQUIRED','SWIM_ORIGINAL_BEFORE_AFTER_REQUIRED','SWIM_LOCKED_BATCH_MISMATCH','SWIM_LOCKED_CONTENT_MISMATCH','SWIM_DELAY_REASON_REQUIRED','SWIM_DELAY_WINDOW_EXPIRED','LOCKED_BATCH_CONTENT_HASH_REQUIRED']) assert.deepEqual(publicErrorDetails({reason}),{reason});
  assert.deepEqual(publicErrorDetails({reason:'private-internal-value',invariant:'private'}),{});
  assert.deepEqual(publicErrorDetails({itemErrors:[{details:{reason:'SWIM_INTAKE_REQUIRED',invariant:'private'}}]}),{itemErrors:[{details:{reason:'SWIM_INTAKE_REQUIRED'}}]});
});
