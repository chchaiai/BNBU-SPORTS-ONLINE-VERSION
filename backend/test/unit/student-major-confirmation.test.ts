import assert from 'node:assert/strict';
import {test} from 'node:test';
import {canChangeAcademicDetails,validAcademicDetails} from '../../src/modules/users/application/student-academics.js';

test('undeclared is valid only in a known college',()=>{
  assert.equal(validAcademicDetails('SCC','未分流'),true);
  assert.equal(validAcademicDetails('GS','未分流'),true);
  assert.equal(validAcademicDetails('UNKNOWN','未分流'),false);
});
test('formal confirmation is one-way and administrator correction cannot restore a consumed opportunity',()=>{
  const undeclared={collegeName:'SCC',majorName:'未分流'};
  const formal={collegeName:'SCC',majorName:'JC'};
  assert.equal(canChangeAcademicDetails(undeclared,formal,false),true);
  assert.equal(canChangeAcademicDetails(formal,{...formal,majorName:'MUS'},false),false);
  assert.equal(canChangeAcademicDetails(formal,undeclared,false),false);
  assert.equal(canChangeAcademicDetails(undeclared,formal,true),false);
  assert.equal(canChangeAcademicDetails(formal,formal,true),true);
  assert.equal(canChangeAcademicDetails(formal,{collegeName:'SAI',majorName:'JC'},false),false);
});
