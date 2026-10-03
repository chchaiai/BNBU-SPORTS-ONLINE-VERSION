import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyWorkspace } from './js/data.js';
import { storeAuthSession, clearApiSession } from './js/api.js';
import { saveSession, loadSession } from './js/session.js';
import { checkinActions } from './js/screens/checkin.js';

function setup(t, records = [], failure = false, phase = 'finished') {
  const memory = new Map(), calls = [];
  globalThis.localStorage = { getItem: k => memory.get(k) ?? null, setItem: (k,v) => memory.set(k,v), removeItem: k => memory.delete(k) };
  storeAuthSession({ accessToken:'test', refreshToken:'test', accessTokenExpiresAt:'2099-01-01T00:00:00Z', user:{id:'student'} });
  const workspace = emptyWorkspace(); workspace.student.id = 'student';
  const app = { state:{workspace,dialog:null},ui:{},isApiMode:()=>true,render(){},showDialog(dialog){this.state.dialog=dialog;} };
  saveSession('student',{phase,serverId:'session',serverVersion:3,details:{creditType:'general',sportType:'cycling',description:''}});
  t.mock.method(globalThis,'fetch',async (url, init = {}) => {
    const method = init.method || 'GET'; calls.push({url,method,body:init.body && JSON.parse(init.body)});
    if (url.includes('/audit-logs/client-errors')) return Response.json({data:{}});
    if (failure) return Response.json({code:'CONFLICT_VERSION_MISMATCH',requestId:'test-failure'},{status:409});
    if (method === 'GET') return Response.json({data:records,meta:{pagination:{nextCursor:null}}});
    if (url.endsWith('/discard') || url.endsWith('/cancel')) return Response.json({data:{status:'CANCELLED'}});
    return Response.json({code:'VALIDATION_FAILED'},{status:422});
  });
  t.after(()=>{clearApiSession();delete globalThis.localStorage;});
  return {app,calls};
}

test('discard completed general exercise with empty description never creates a draft',async t=>{
  const {app,calls}=setup(t);
  await checkinActions['checkin.abandonConfirm'](app);
  assert.equal(loadSession('student'),null);
  assert.equal(app.state.dialog,null);
  assert.deepEqual(calls.map(c=>c.method),['GET']);
});

test('existing draft is discarded with its current version',async t=>{
  const {app,calls}=setup(t,[{id:'draft',sessionId:'session',status:'DRAFT',version:7}]);
  await checkinActions['checkin.abandonConfirm'](app);
  assert.equal(loadSession('student'),null);
  assert.equal(calls[1].url,'/api/v1/exercise-records/draft/discard');
  assert.deepEqual(calls[1].body,{expectedVersion:7,reason:'student discarded'});
  assert.equal(calls.length,2);
});

for (const status of ['SUBMITTED','REVIEWED','CANCELLED']) test(`discard stale local form preserves ${status} server record`,async t=>{
  const {app,calls}=setup(t,[{id:'record',sessionId:'session',status,version:7}]);
  await checkinActions['checkin.abandonConfirm'](app);
  assert.equal(loadSession('student'),null);
  assert.deepEqual(calls.map(c=>c.method),['GET']);
});

test('failed server read retains local session for retry',async t=>{
  const {app}=setup(t,[],true);
  await checkinActions['checkin.abandonConfirm'](app);
  assert.equal(loadSession('student').serverId,'session');
  assert.ok(app.state.dialog);
});

test('unfinished exercise still uses session cancellation',async t=>{
  const {app,calls}=setup(t,[],false,'paused');
  await checkinActions['checkin.abandonConfirm'](app);
  assert.equal(loadSession('student'),null);
  assert.equal(calls[0].url,'/api/v1/exercise-sessions/session/cancel');
  assert.equal(calls[0].body.expectedVersion,3);
});
