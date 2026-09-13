import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationText} from '../../BNBU-Sports-Web-new/frontend/student/js/notification-text.js';
const zh=(a)=>a,en=(_a,b)=>b;
const notice={notificationType:'EXERCISE_RECORD_RESULT',title:'old title',message:'old body',reviewContent:{version:1,stage:'INVALID',reasonCode:'UNCLEAR_EVIDENCE',publicComment:'材料不清晰\nTeacher original words'}};
test('fixed facts switch language while teacher words stay byte-for-byte',()=>{
 assert.deepEqual(notificationText(notice,en),{title:'Exercise record invalid',message:'Unclear evidence\n材料不清晰\nTeacher original words'});
 assert.equal(notificationText(notice,zh).message,'材料不清晰\n材料不清晰\nTeacher original words');
});
test('accepted result without comment uses translated system title',()=>{
 assert.deepEqual(notificationText({...notice,reviewContent:{version:1,stage:'VALID',reasonCode:null,publicComment:null}},en),{title:'Exercise record accepted',message:'Exercise record accepted'});
});
test('legacy, unknown version and unrelated notice retain original text',()=>{
 for(const value of [{...notice,reviewContent:null},{...notice,reviewContent:{...notice.reviewContent,version:2}},{...notice,notificationType:'FEEDBACK_UPDATED'}])assert.deepEqual(notificationText(value,en),{title:'old title',message:'old body'});
});
test('unknown codes do not cause inferred or fabricated text',()=>{
 assert.equal(notificationText({...notice,reviewContent:{...notice.reviewContent,reasonCode:'UNKNOWN'}},en).message,'old body');
});
