import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectCredits, type CreditCandidate } from '../../src/modules/v8/domain/crediting.js';
const item = (id: string, category: CreditCandidate['category'], day: number, seconds = 3600, valid = true): CreditCandidate =>
  ({id, category, startedAt:`2026-09-${day}T00:00:00Z`,businessDate:`2026-09-${day}`,actualSeconds:seconds,valid,previouslySelected:false});
const rules = {minimumMinutes:30,maximumMinutes:60,weeklyLimit:3,dailyLimit:1,courseTarget:0,generalTarget:120};
test('zero course target credits historical course records to general without mutating originals', () => {
  const records = [item('a','COURSE_RELATED',14),item('b','GENERAL',15)];
  const result=selectCredits(records,rules);
  assert.equal(result.courseMinutes,0);assert.equal(result.generalMinutes,120);
  assert.equal(records[0]?.category,'COURSE_RELATED');
});
test('transferred credits obey validity, minimum, maximum, daily, weekly and target limits', () => {
  const records=[item('a','COURSE_RELATED',14,7200),item('b','GENERAL',14),item('c','COURSE_RELATED',15,1799),
    item('d','COURSE_RELATED',16,3600,false),item('e','COURSE_RELATED',17),item('f','GENERAL',18)];
  const result=selectCredits(records,{...rules,generalTarget:300,weeklyLimit:2});
  assert.equal(result.generalMinutes,120);assert.equal(result.records.filter(r=>r.selected).length,2);
  assert.equal(result.records.find(r=>r.id==='c')?.creditedMinutes,0);assert.equal(result.records.find(r=>r.id==='d')?.creditedMinutes,0);
  assert.equal(selectCredits(records,{...rules,generalTarget:75}).generalMinutes,75);
});
test('positive course targets retain independent category credit',()=>{
  const result=selectCredits([item('a','COURSE_RELATED',14)],{...rules,courseTarget:120});
  assert.equal(result.courseMinutes,60);assert.equal(result.generalMinutes,0);
});
