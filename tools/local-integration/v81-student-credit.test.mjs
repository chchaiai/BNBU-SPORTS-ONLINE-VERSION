import test from 'node:test';
import assert from 'node:assert/strict';
import {creditedHours,sessionDurationMs,shouldAutoEnd,restoreServerSession} from '../../BNBU-Sports-Web-new/frontend/student/js/session.js';
test('published thresholds use whole minutes and a sixty-minute credit cap',()=>{
  for(const minimum of [30,45,60]){
    assert.equal(creditedHours(minimum*60000-1,minimum),0);
    assert.equal(creditedHours(minimum*60000,minimum),minimum/60);
    assert.equal(creditedHours(90*60000,minimum),1);
  }
  assert.equal(creditedHours(45*60000+59000,30),0.75);
  assert.equal(creditedHours(1800000,undefined),null);
  assert.equal(creditedHours(-1,30),null);
});
test('a legitimate active session continues beyond two hours',()=>{
  const session={phase:'active',accumulatedMs:0,lastResumedAt:1000};
  assert.equal(sessionDurationMs(session,1000+150*60000),150*60000);
  assert.equal(shouldAutoEnd(session,1000+150*60000),false);
});

test('restoring a server session retains identity, duration and pause without inventing evidence',()=>{
  const server={id:'session',enrollmentId:'enrollment',status:'IN_PROGRESS',version:3,actualDurationSeconds:2104,startedAt:'2026-09-08T03:21:21Z'};
  const details={creditType:'general',sportType:'running'};
  const active=restoreServerSession(server,details,10000000);
  assert.equal(active.serverId,server.id);assert.equal(active.serverVersion,3);
  assert.equal(active.startedAt,Date.parse(server.startedAt));assert.equal(active.enrollmentId,server.enrollmentId);
  assert.equal(sessionDurationMs(active,10005000),2109000);assert.deepEqual(active.drafts,[]);
  assert.deepEqual(active.details,details);
  const paused=restoreServerSession({...server,status:'PAUSED'},details,10000000);
  assert.equal(sessionDurationMs(paused,10005000),2104000);
  for(const override of [{status:'COMPLETED'},{version:0},{actualDurationSeconds:-1},{actualDurationSeconds:Number.MAX_SAFE_INTEGER},{startedAt:'invalid'},{id:''}])
    assert.throws(()=>restoreServerSession({...server,...override},details));
});
