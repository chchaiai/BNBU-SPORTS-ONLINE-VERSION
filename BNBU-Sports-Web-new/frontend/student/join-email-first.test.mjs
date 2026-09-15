import assert from 'node:assert/strict';
import test from 'node:test';
import {renderCourseJoinConfirm,joinActions} from './js/screens/join.js';
const course={real:true,name:'Synthetic Course',teacher:'Teacher',semester:'Term',expiresAt:new Date(Date.now()+600000).toISOString()};
const appFor=verified=>({ui:{},state:{authenticated:verified,workspace:{student:{emailVerified:verified,email:'s@mail.bnbu.edu.cn',name:'Student',id:'123',gender:'MALE',admissionYear:2026}},pendingInvite:{code:'synthetic-invite',course},subParams:{inviteCode:'synthetic-invite',course}},isWriteAllowed:()=>true,canStartNewCourseJoin:()=>true,render(){}});
test('new registration renders email verification before editable student details',()=>{
 const app=appFor(false),html=renderCourseJoinConfirm(app,{course,inviteCode:'synthetic-invite',preLogin:true});
 assert.match(html,/joinConfirm.sendEmail/);assert.doesNotMatch(html,/data-action="joinConfirm.submit"/);assert.doesNotMatch(html,/id="join-name"/);
 joinActions['joinConfirm.submit'](app);assert.equal(app.ui.joinConfirm.submitting,false);
});
test('verified logged-in student goes directly to information confirmation',()=>{
 const html=renderCourseJoinConfirm(appFor(true),{course,inviteCode:'synthetic-invite'});
 assert.doesNotMatch(html,/joinConfirm.sendEmail/);assert.match(html,/data-action="joinConfirm.submit"/);
});
