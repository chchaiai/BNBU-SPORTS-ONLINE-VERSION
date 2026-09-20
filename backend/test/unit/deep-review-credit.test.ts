import {test} from 'node:test';
import {computeCredits} from '../../src/modules/v8/credit-computation.js';
import type {CreditCandidate} from '../../src/modules/v8/domain/crediting.js';
import assert from 'node:assert/strict';
import {selectCredits as original} from '../fixtures/credit-review/original-crediting.js';
import {selectCredits as updated} from '../../src/modules/v8/domain/crediting.js';
test("1500 seeded equivalence vectors",()=>{
let seed=917;const rand=(n:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
for(let trial=0;trial<1500;trial++){
 const count=1+rand(12), rules={minimumMinutes:1+rand(10),dailyLimit:1+rand(3),weeklyLimit:1+rand(5),courseTarget:rand(120),generalTarget:1+rand(120)};
 const recognized={course:rand(rules.courseTarget+1),general:rand(rules.generalTarget+1)};
 const candidates:CreditCandidate[]=Array.from({length:count},(_,i)=>{let date=new Date(Date.UTC(2026,8,1+rand(20))).toISOString().slice(0,10);return {id:`r${i}`,category:rand(2)?'GENERAL':'COURSE_RELATED',businessDate:date,startedAt:date+`T${String(rand(23)).padStart(2,'0')}:00:00Z`,actualSeconds:rand(75)*60,maximumMinutes:30+rand(40),valid:rand(5)!==0,previouslySelected:rand(3)===0};});
 const reserved={days:new Map([['2026-09-02',rand(3)]]),weeks:new Map([['2026-08-31',rand(3)]])};
 assert.deepEqual(updated(candidates,rules,recognized,reserved),original(candidates,rules,recognized,reserved),`trial ${trial}`);
}
});

for(const n of [10,30,60,120])test(`bounded computation: ${n} records and historical stability`,async()=>{
 const rows:CreditCandidate[]=Array.from({length:n},(_,i)=>{const date=new Date(Date.UTC(2026,8,1+i)).toISOString().slice(0,10);return {id:`r${i}`,category:i%2?'GENERAL':'COURSE_RELATED',startedAt:`${date}T10:00:00Z`,businessDate:date,actualSeconds:(30+i*17%31)*60,valid:true,previouslySelected:false,maximumMinutes:60};});
 const rules={minimumMinutes:30,weeklyLimit:3,dailyLimit:1,courseTarget:600,generalTarget:600};
 const start=performance.now();let lag=0;const timer=new Promise<void>(resolve=>setTimeout(()=>{lag=performance.now()-start;resolve();},0));
 const result=await computeCredits(rows,rules);await timer;
 assert.equal(result.totalMinutes,n===10?307:n===30?790:1200);assert.ok(performance.now()-start<1500);assert.ok(lag<250);
 const chosen=new Set(result.records.filter(r=>r.selected).map(r=>r.id));
 assert.deepEqual(await computeCredits(rows.map(r=>({...r,previouslySelected:chosen.has(r.id)})),rules),result);
});
