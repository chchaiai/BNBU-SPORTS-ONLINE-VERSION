import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverLegacyReviewContent } from '../../src/modules/v8/domain/notification-history.js';
const accepted = {version:1,stage:'VALID',reasonCode:null,publicComment:null};
const notice = {notificationType:'EXERCISE_RECORD_RESULT',title:'运动记录有效',body:'运动记录有效'};
test('unique matching historical fact restores typed content',()=>assert.deepEqual(recoverLegacyReviewContent(notice,[accepted,accepted]),accepted));
test('same serialized text from different teacher facts is ambiguous',()=>assert.equal(recoverLegacyReviewContent(notice,[accepted,{...accepted,publicComment:'运动记录有效'}]),null));
test('mismatched notification or history is not rewritten',()=>{
 assert.equal(recoverLegacyReviewContent({...notice,body:'different'},[accepted]),null);
 assert.equal(recoverLegacyReviewContent({...notice,notificationType:'FEEDBACK_UPDATED'},[accepted]),null);
 assert.equal(recoverLegacyReviewContent(notice,[]),null);
});
test('English reason and original multilingual teacher comment match exactly',()=>{
 const candidate={version:1,stage:'INVALID',reasonCode:'UNCLEAR_EVIDENCE',publicComment:'材料不清晰\nOriginal'};
 assert.deepEqual(recoverLegacyReviewContent({notificationType:'EXERCISE_RECORD_RESULT',title:'Exercise record invalid',body:'Unclear evidence\n材料不清晰\nOriginal'},[candidate]),candidate);
});
