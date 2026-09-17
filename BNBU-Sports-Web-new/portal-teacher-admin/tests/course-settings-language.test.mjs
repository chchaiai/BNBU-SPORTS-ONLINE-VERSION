import assert from 'node:assert/strict';
import test from 'node:test';
import { translateText } from '../app/language.tsx';

test('course settings translate dynamic values without losing saved facts', () => {
  assert.equal(translateText('总目标为 1,200 分钟。'), 'The total target is 1,200 minutes.');
  assert.equal(translateText('已发布：门槛 30 分钟，每周最多 3 次。'), 'Published: minimum 30 minutes, up to 3 sessions per week.');
  assert.equal(translateText('结算报告 v2 已保存。'), 'Settlement report v2 saved.');
});
