import assert from 'node:assert/strict';
import {test} from 'node:test';
import {shouldSampleAiReview} from '../../src/modules/v8/v81-ai-review-store.js';
test('sampling selects a stable subset of students and a subset of their records',()=>{
 let students=0,records=0;
 for(let s=0;s<1000;s++){let count=0;for(let r=0;r<100;r++){const selected=shouldSampleAiReview('org',String(s),String(r));assert.equal(selected,shouldSampleAiReview('org',String(s),String(r)));if(selected)count++;}if(count){students++;assert.ok(count<100);}records+=count;}
 assert.ok(students>130&&students<270);assert.ok(records>2000&&records<7000);
});
