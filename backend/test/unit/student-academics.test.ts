import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StudentIdentityNormalizer } from '../../src/modules/users/application/student-identity-normalizer.js';
const normalizer = new StudentIdentityNormalizer();
const base = {fullName:'Synthetic',studentNumber:'2300000001',gender:'FEMALE',gradeYear:2026,collegeName:'FST',majorName:'CST'};
test('trusted profile completion preserves stored legacy identifiers while retaining academic validation',()=>{
  assert.equal(normalizer.normalize({...base,studentNumber:'OLD-01'},{preserveStoredStudentNumber:true}).studentNumber,'OLD-01');
  assert.throws(()=>normalizer.normalize({...base,studentNumber:'OLD-01'}));
  assert.throws(()=>normalizer.normalize({...base,studentNumber:'OLD-01',majorName:'INVALID'},{preserveStoredStudentNumber:true}));
});
test('new enrollment rejects invalid identifiers, unknown colleges and cross-college majors',()=>{
  for(const studentNumber of ['1300000001','230000001','23000000011','230000000A']) assert.throws(()=>normalizer.normalize({...base,studentNumber}));
  for(const collegeName of ['OTHER','fst','自填学院']) assert.throws(()=>normalizer.normalize({...base,collegeName}));
  for(const majorName of ['ACCT','cst','CST1','C ST']) assert.throws(()=>normalizer.normalize({...base,majorName}));
});
test('SAI accepts all catalog majors and only SGE and GS permit uppercase custom majors',()=>{
  for(const majorName of 'ACCT FIN AE BUSA MHR MKT EBIS EPIN DMM CCGC MCOM PRA ATS ELLS DIS TDH DGS GAD AM FM STAT DS AI CST ENVS FS APSY CCM MAD THEM AIM CTV GD MUS'.split(' ')) {
    assert.equal(normalizer.normalize({...base,collegeName:'SAI',majorName}).majorName,majorName);
  }
  assert.throws(()=>normalizer.normalize({...base,collegeName:'SAI',majorName:'CUSTOM'}));
  for(const collegeName of ['SGE','GS']) {
    assert.equal(normalizer.normalize({...base,collegeName,majorName:'CUSTOM'}).majorName,'CUSTOM');
    for(const majorName of ['custom','CUSTOM1','CUSTOM MAJOR','中文']) assert.throws(()=>normalizer.normalize({...base,collegeName,majorName}));
  }
});
