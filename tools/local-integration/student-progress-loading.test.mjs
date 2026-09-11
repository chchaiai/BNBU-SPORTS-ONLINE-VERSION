import assert from 'node:assert/strict';
import {test} from 'node:test';
import {renderGrades} from '../../BNBU-Sports-Web-new/frontend/student/js/screens/grades.js';

function page(isLoading, minutes) {
  return renderGrades({state:{isLoading,workspace:{student:{gender:'OTHER'},grades:{},
    progress:{totalValidHours:minutes/60,course:0,general:minutes/60,qualificationStatus:'NOT_QUALIFIED'},
    hourRule:{total:20}}}});
}

test('pending progress does not present an authoritative zero or stale credit',()=>{
  for(const minutes of [0,30]){
    const html=page(true,minutes);
    assert.ok(html.includes('正在同步最新打卡进度'));
    assert.equal((html.match(/>—<\/span>/g)||[]).length,3);
    assert.ok(!html.includes('class="hour-progress"'));
    assert.ok(!html.includes('>0 分钟</span>'));
    assert.ok(!html.includes('>30 分钟</span>'));
  }
});

test('loaded zero remains a genuine zero',()=>{
  const html=page(false,0);assert.ok(html.includes('>0 分钟</span>'));
  assert.ok(html.includes('还需 1200 分钟'));assert.ok(!html.includes('正在同步'));
});

test('loaded accepted half-hour is shown in minutes and the correct category',()=>{
  const html=page(false,30);assert.ok(html.includes('>30 分钟</span>'));
  assert.ok(html.includes('还需 1170 分钟'));assert.ok(html.includes('scaleX(0.025)'));
});
