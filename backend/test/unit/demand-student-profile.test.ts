import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StudentIdentityNormalizer, STUDENT_REGION_CODES } from '../../src/modules/users/application/student-identity-normalizer.js';
const normalizer = new StudentIdentityNormalizer();
const identity = { fullName: ' Student ', studentNumber: ' 2300000001 ', gender: 'FEMALE', gradeYear: 2026 };
test('JC enrollment and profile updates follow the SCC and SAI catalogs', () => {
  for (const collegeName of ['SCC', 'SAI']) {
    assert.equal(normalizer.normalize({ ...identity, collegeName, majorName: 'JC' }).majorName, 'JC');
  }
  assert.throws(() => normalizer.normalize({ ...identity, collegeName: 'FST', majorName: 'JC' }));
});
test('long-term personal details normalize without changing stable identity', () => {
  assert.deepEqual(normalizer.normalize({ ...identity, collegeName: '  FST ', majorName: '  CST ', dateOfBirth: '2004-02-29', regionCode: 'HK' }), {
    fullName: 'Student', studentNumber: '2300000001', gender: 'FEMALE', gradeYear: 2026,
    collegeName: 'FST', majorName: 'CST', dateOfBirth: '2004-02-29', regionCode: 'HK',
  });
});
test('rejects impossible, future and malformed birth dates', () => {
  for (const dateOfBirth of ['2003-02-29', '2004-02-30', '2100-01-01', '1899-12-31', '2004-2-9']) {
    assert.throws(() => normalizer.normalize({ ...identity, dateOfBirth }));
  }
});
test('region list covers 31 mainland areas, Hong Kong, Macao, Taiwan and other', () => {
  assert.equal(STUDENT_REGION_CODES.size, 35);
  for (const regionCode of STUDENT_REGION_CODES) assert.equal(normalizer.normalize({ ...identity, regionCode,
    ...(regionCode === 'OTHER' ? {otherRegionName:'Japan'} : {}) }).regionCode, regionCode);
  assert.throws(() => normalizer.normalize({ ...identity, regionCode: 'CN-99' }));
});
test('OTHER requires a concrete country name and does not accept empty or overlong text', () => {
  for (const otherRegionName of [undefined, '', '   ', 'x'.repeat(101)])
    assert.throws(()=>normalizer.normalize({...identity,regionCode:'OTHER',...(otherRegionName === undefined ? {} : {otherRegionName})}));
  assert.equal(normalizer.normalize({...identity,regionCode:'OTHER',otherRegionName:' Canada '}).otherRegionName,'Canada');
  assert.throws(()=>normalizer.normalize({...identity,regionCode:'HK',otherRegionName:'Canada'}));
});
