import test from 'node:test';
import assert from 'node:assert/strict';
import { projectReviewNotificationContent } from '../../src/modules/v8/domain/notification-content.js';
import { projectNotification, type NotificationRow } from '../../src/modules/client-capabilities/client-messaging.projection.js';
test('review projection exposes only immutable public fields', () => {
  const value={version:1,stage:'INVALID',reasonCode:'UNCLEAR_EVIDENCE',publicComment:'材料不清晰\nOriginal',internalNote:'must not escape'};
  assert.deepEqual(projectReviewNotificationContent(value),{version:1,stage:'INVALID',reasonCode:'UNCLEAR_EVIDENCE',publicComment:'材料不清晰\nOriginal'});
});
test('unknown and incomplete review facts do not fabricate content',()=>{
  for(const value of [null,{},[],{version:2,stage:'VALID',reasonCode:null,publicComment:null},{version:1,stage:'VALID',reasonCode:'UNKNOWN',publicComment:null}])assert.equal(projectReviewNotificationContent(value),null);
});
test('notification projection preserves legacy body and gates typed facts by notification type',()=>{
  const row={id:'id',organizationId:'org',recipientUserId:'user',notificationType:'EXERCISE_RECORD_RESULT',title:'original',body:'untouched',targetType:'EXERCISE_RECORD',targetId:'record',readAt:null,createdAt:new Date(0),version:1,reviewContent:{version:1,stage:'VALID',reasonCode:null,publicComment:null}} satisfies NotificationRow;
  assert.equal(projectNotification(row).body,'untouched');assert.equal(projectNotification(row).reviewContent?.stage,'VALID');
  assert.ok(!Object.hasOwn(projectNotification({...row,notificationType:'FEEDBACK_UPDATED'}),'reviewContent'));
  assert.ok(!Object.hasOwn(projectNotification({...row,reviewContent:null}),'reviewContent'));
});
