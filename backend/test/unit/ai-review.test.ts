import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideAiReview, parseAiAssessment, recommendAiReview } from '../../src/modules/v8/domain/ai-review.js';
import { TencentAiReviewProvider, aiReviewConfiguration } from '../../src/modules/v8/tencent-ai-review-provider.js';
const positive = { contentSafety: 'SAFE', exercise: 'YES', sportMatch: 'YES', confidence: 0.95 } as const;
test('AI only routes exceptions to teachers and never rejects students', () => {
  assert.equal(decideAiReview(positive,false,false),null);
  for (const assessment of [{...positive,contentSafety:'UNSAFE'}, {...positive,exercise:'NO'}, {...positive,sportMatch:'NO'}, {...positive,confidence:0.4}]) {
    assert.equal(decideAiReview(parseAiAssessment(assessment),false,false),'PENDING_TEACHER');
  }
  assert.equal(decideAiReview(positive,true,false),'PENDING_TEACHER');
  assert.equal(decideAiReview(positive,false,true),'PENDING_TEACHER');
});
test('AI advice is conservative with uncertain, duplicate, sampled and unsafe evidence', () => {
  assert.equal(recommendAiReview(positive,false,false).recommendation,'SUGGEST_PASS');
  assert.equal(recommendAiReview({...positive,confidence:0.4},false,false).recommendation,'TEACHER_REVIEW');
  assert.equal(recommendAiReview({...positive,exercise:'UNCERTAIN'},false,false).recommendation,'TEACHER_REVIEW');
  assert.equal(recommendAiReview(positive,false,true).recommendation,'TEACHER_REVIEW');
  assert.equal(recommendAiReview(positive,true,false).recommendation,'SUSPECTED_RISK');
  assert.equal(recommendAiReview({...positive,contentSafety:'UNSAFE'},false,false).recommendation,'SUSPECTED_RISK');
  assert.equal(recommendAiReview({...positive,sportMatch:'NO'},false,false).recommendation,'SUSPECTED_RISK');
});
test('untrusted model output never adds actions or arbitrary properties', () => {
  assert.deepEqual(parseAiAssessment({...positive,action:'APPROVE',sql:'DROP TABLE'}),positive);
  for (const bad of [null,[],{}, {...positive,confidence:NaN}, {...positive,confidence:2}, {...positive,exercise:'APPROVE'}]) assert.throws(()=>parseAiAssessment(bad));
  assert.throws(()=>aiReviewConfiguration({AI_REVIEW_ENABLED:'true',AI_REVIEW_BUDGET_FEN:'500001'}));
});
test('moderation uncertainty overrides model pass; provider response is bounded', async () => {
  let visionCalls = 0;
  const provider = new TencentAiReviewProvider({enabled:true,budgetFen:500000},{
    ims:{request:()=>Promise.resolve({Suggestion:'Review'})},
    vision:{request:()=>{visionCalls++;return Promise.resolve({choices:[{finish_reason:'stop',message:{content:JSON.stringify(positive)}}]});}},
  });
  const result = await provider.assess({sport:'RUNNING',images:[Buffer.from('synthetic')],sampledVideo:false,signal:AbortSignal.timeout(1000)});
  assert.equal(result.contentSafety,'UNCERTAIN'); assert.equal(visionCalls,1);
  const blocked = new TencentAiReviewProvider({enabled:true,budgetFen:500000},{ims:{request:()=>Promise.resolve({Suggestion:'Block'})},vision:{request:()=>Promise.reject(new Error('must not call'))}});
  assert.equal((await blocked.assess({sport:'RUNNING',images:[Buffer.from('synthetic')],sampledVideo:false,signal:AbortSignal.timeout(1000)})).contentSafety,'UNSAFE');
});
