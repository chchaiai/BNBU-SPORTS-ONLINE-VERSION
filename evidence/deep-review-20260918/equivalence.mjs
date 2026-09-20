import assert from 'node:assert/strict';
import {selectCredits as original} from './original-crediting.ts';
import {selectCredits as updated} from '../../backend/src/modules/v8/domain/crediting.ts';
let seed=917;const rand=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
for(let trial=0;trial<1500;trial++){
 const count=1+rand(12), rules={minimumMinutes:1+rand(10),dailyLimit:1+rand(3),weeklyLimit:1+rand(5),courseTarget:rand(120),generalTarget:1+rand(120)};
 const recognized={course:rand(rules.courseTarget+1),general:rand(rules.generalTarget+1)};
 const candidates=Array.from({length:count},(_,i)=>{let date=new Date(Date.UTC(2026,8,1+rand(20))).toISOString().slice(0,10);return {id:`r${i}`,category:rand(2)?'GENERAL':'COURSE_RELATED',businessDate:date,startedAt:date+`T${String(rand(23)).padStart(2,'0')}:00:00Z`,actualSeconds:rand(75)*60,maximumMinutes:30+rand(40),valid:rand(5)!==0,previouslySelected:rand(3)===0};});
 const reserved={days:new Map([['2026-09-02',rand(3)]]),weeks:new Map([['2026-08-31',rand(3)]])};
 assert.deepEqual(updated(candidates,rules,recognized,reserved),original(candidates,rules,recognized,reserved),`trial ${trial}`);
}
console.log('1500 seeded equivalence cases PASS');
