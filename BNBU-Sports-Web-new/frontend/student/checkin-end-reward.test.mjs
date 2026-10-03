import test from 'node:test';
import assert from 'node:assert/strict';
import {isEndReward,endRewardText} from './js/checkin-end-reward.js';
import {setLanguage} from './js/i18n.js';

test('end reward only follows the confirmed completion of the same live session',()=>{
  const previous={page:'running',phase:'paused',owner:'student',session:'exercise'};
  const root={dataset:{checkinPage:'finished',checkinOwner:'student',checkinSession:'exercise'}};
  assert.equal(isEndReward(previous,root),true);
  assert.equal(isEndReward({...previous,phase:'active'},root),true);
  for(const old of [null,{...previous,phase:'finished'},{...previous,owner:'other'},{...previous,session:'other'},{...previous,page:'home'}])assert.equal(isEndReward(old,root),false);
  assert.equal(isEndReward(previous,{dataset:{...root.dataset,checkinPage:'running'}}),false);
  assert.equal(isEndReward(previous,{dataset:{...root.dataset,checkinPage:'submitted'}}),false);
});
test('encouragement distinguishes short sessions and unknown rules without claiming submitted credit',()=>{
  setLanguage('zh');
  assert.equal(endRewardText(0),'每一次行动，都有意义。');
  assert.equal(endRewardText(.5),'目标达成，做得不错。');
  assert.equal(endRewardText(null),'今天的坚持，已完成。');
  assert.equal(endRewardText(undefined),'今天的坚持，已完成。');
  for(const credit of [0,.5,null])assert.doesNotMatch(endRewardText(credit),/打卡成功|已计入/);
});
