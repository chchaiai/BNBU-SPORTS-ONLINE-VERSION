import assert from 'node:assert/strict';
import test from 'node:test';
import {mapClassSectionToCourse} from '../app/teacher-data.ts';

test('a renamed teaching course displays its current name without changing its catalog identity',()=>{
  const section={id:'section',courseId:'catalog',displayName:'Renamed course',classCode:'CLASS',version:2,semesterId:'semester',status:'ACTIVE'};
  const view=mapClassSectionToCourse(section,{courseName:'Original catalog name',courseCode:'CAT'},'Semester',null);
  assert.equal(view.name,'Renamed course');assert.equal(view.courseId,'catalog');assert.equal(view.version,2);
});
