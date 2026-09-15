import assert from 'node:assert/strict';
import test from 'node:test';
import {STUDENT_COLLEGES,academicMajorOptions,allowsCustomMajor,validAcademicDetails} from './js/student-academics.js';
import {joinActions} from './js/screens/join.js';
test('seven colleges expose matching catalogs, all majors for SAI and custom text only for SGE and GS',()=>{
 assert.equal(STUDENT_COLLEGES.length,7);assert.equal(academicMajorOptions('SAI').length,34);
 assert.deepEqual(academicMajorOptions('FBM'),['ACCT','FIN','AE','BUSA','MHR','MKT','EBIS','EPIN','DMM']);
 assert.equal(validAcademicDetails('FST','ACCT'),false);assert.equal(validAcademicDetails('SAI','ACCT'),true);
 assert.equal(allowsCustomMajor('OTHER'),false);assert.equal(validAcademicDetails('GS','CUSTOM'),true);assert.equal(validAcademicDetails('SGE','Custom'),false);
});
test('changing college clears a previous major before showing the new options',()=>{
 const app={ui:{joinConfirm:{collegeName:'FST',majorName:'CST'}},render(){}};
 joinActions['joinConfirm.select'](app,{dataset:{field:'collegeName'},value:'FBM'});
 assert.equal(app.ui.joinConfirm.collegeName,'FBM');assert.equal(app.ui.joinConfirm.majorName,'');
});
