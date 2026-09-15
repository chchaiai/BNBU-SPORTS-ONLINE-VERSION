import assert from 'node:assert/strict';
import test from 'node:test';
import { adminStudentRegion } from '../app/student-region.ts';

test('student account regions use the registration catalog in both languages', () => {
  for (const [code, zh, en] of [['CN-44','广东','Guangdong'], ['CN-23','黑龙江','Heilongjiang'], ['CN-37','山东','Shandong'], ['CN-34','安徽','Anhui'], ['HK','香港','Hong Kong'], ['MO','澳门','Macao'], ['TW','台湾','Taiwan']]) {
    assert.equal(adminStudentRegion({regionCode: code}, 'zh'), zh);
    assert.equal(adminStudentRegion({regionCode: code}, 'en'), en);
  }
});
test('custom, absent and unrecognized regions preserve meaningful information', () => {
  assert.equal(adminStudentRegion({regionCode: 'OTHER', otherRegionName: ' 加拿大 '}, 'zh'), '加拿大');
  assert.equal(adminStudentRegion({regionCode: 'OTHER'}, 'zh'), '其他国家或地区');
  assert.equal(adminStudentRegion({regionCode: 'OTHER'}, 'en'), 'Other country or region');
  assert.equal(adminStudentRegion({}, 'zh'), '—');
  assert.equal(adminStudentRegion({regionCode: 'UNKNOWN-FUTURE'}, 'en'), 'UNKNOWN-FUTURE');
  assert.equal(adminStudentRegion({regionCode: 'CN-44', otherRegionName: 'stale'}, 'zh'), '广东');
});
