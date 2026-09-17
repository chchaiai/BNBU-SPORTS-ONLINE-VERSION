import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectProfile } from '../../src/modules/users/application/student-profile-quality.js';
const valid={id:'test',organizationId:'test',version:1,studentNumber:'2300000001',fullName:'陈小明',gender:'MALE',gradeYear:2023,collegeName:'FST',majorName:'CST',dateOfBirth:'2004-02-29',regionCode:'HK'};
test('valid existing student needs no correction',()=>assert.equal(inspectProfile(valid).profileQualityStatus,'NORMAL'));
test('old college, number and missing personal details require correction',()=>{
  const quality=inspectProfile({...valid,studentNumber:'old123',collegeName:'理工学院',dateOfBirth:null,gender:'UNKNOWN'});
  assert.equal(quality.profileQualityStatus,'REQUIRES_PROFILE_UPDATE');
  for(const field of ['studentNumber','collegeName','majorName','dateOfBirth','gender']) assert.ok(quality.profileQualityReasons.includes(field));
});
test('definite invalid name remains blocked after confirmation',()=>{
  for(const fullName of ['学生123','张😀','\u0000陈']) assert.equal(inspectProfile({...valid,fullName},true).profileQualityStatus,'REQUIRES_PROFILE_UPDATE');
});
test('unusual but plausible name is reviewable and confirmation clears suspicion',()=>{
  assert.equal(inspectProfile({...valid,fullName:'李'}).profileQualityStatus,'PENDING_REVIEW');
  assert.equal(inspectProfile({...valid,fullName:'李'},true).profileQualityStatus,'NORMAL');
  for(const fullName of ['O’Connor','Anne-Marie','阿卜杜·卡里姆']) assert.equal(inspectProfile({...valid,fullName}).profileQualityStatus,'NORMAL');
});
test('bad date, year and OTHER region are blocked',()=>{
  for(const dateOfBirth of ['2003-02-29','2100-01-01','']) assert.ok(inspectProfile({...valid,dateOfBirth}).profileQualityReasons.includes('dateOfBirth'));
  assert.ok(inspectProfile({...valid,gradeYear:9999}).profileQualityReasons.includes('gradeYear'));
  assert.ok(inspectProfile({...valid,regionCode:'OTHER'}).profileQualityReasons.includes('regionCode'));
});
