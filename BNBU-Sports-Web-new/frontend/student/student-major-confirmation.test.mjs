import assert from 'node:assert/strict';
import test from 'node:test';
import { profileActions, profileCompletionForm, renderAccountDetails } from './js/screens/profile.js';
import { ApiError, toUserFacingError } from './js/api.js';

test('a complete undeclared profile exposes its one-time confirmation entry',()=>{
  const student={name:'Synthetic Student',id:'2106301639',gender:'MALE',admissionYear:2026,college:'SCC',major:'未分流',dateOfBirth:'2004-01-01',regionCode:'HK',majorConfirmationLocked:false};
  const app={state:{workspace:{student}},ui:{},isApiMode:()=>true};
  assert.match(renderAccountDetails(app),/data-action="profile.editDetails"/);
  student.majorConfirmationLocked=true;
  assert.doesNotMatch(renderAccountDetails(app),/data-action="profile.editDetails"/);
});

test('confirmed major and college are read-only while other profile corrections remain available',()=>{
  const app={state:{workspace:{student:{majorConfirmationLocked:true,profileQualityReasons:[]}}},ui:{profileDetails:{collegeName:'SCC',majorName:'JC'}},render(){}};
  const html=profileCompletionForm(app);
  assert.match(html,/data-field="collegeName" disabled/);
  assert.doesNotMatch(html,/data-field="majorName"/);
  assert.match(html,/data-field="fullName"/);
  profileActions['profile.detailsField'](app,{dataset:{field:'majorName'},value:'MUS'});
  assert.equal(app.ui.profileDetails.majorName,'JC');
});
test('locked major error preserves its diagnostic reference and directs students to an administrator',()=>{
  const result=toUserFacingError(new ApiError(422,{code:'USER_PROFILE_INVALID',requestId:'major-test-123',details:{fieldErrors:[{field:'majorName',code:'MAJOR_CONFIRMATION_LOCKED'}]}}),{log:false});
  assert.equal(result.requestId,'major-test-123');assert.equal(result.retryable,false);
  assert.match(result.action,/管理员|administrator/);
});
