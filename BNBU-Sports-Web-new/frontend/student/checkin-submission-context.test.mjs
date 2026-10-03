import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyWorkspace} from './js/data.js';
import {storeAuthSession, clearApiSession} from './js/api.js';
import {loadSession, saveSession} from './js/session.js';
import {checkinActions} from './js/screens/checkin.js';

function setup(t) {
  const memory = new Map(), calls = [];
  const originalStorage=globalThis.localStorage;
  globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
  storeAuthSession({accessToken:'test',refreshToken:'test',accessTokenExpiresAt:'2099-01-01T00:00:00Z',user:{id:'student'}});
  const workspace=emptyWorkspace(); workspace.student.id='student';
  const ui={drafts:[{id:'proof',type:'image',mediaId:'media',serverOnly:true}],finish:{submitting:false}};
  const app={state:{workspace},ui:{checkin:ui},isApiMode:()=>true,isWriteAllowed:()=>true,render(){this.renders++;},renders:0};
  saveSession('student',{phase:'finished',serverId:'session',details:{creditType:'general',sportType:'running',description:'Completed exercise'}});
  let respond;
  const pending=new Promise(resolve=>{respond=resolve;});
  t.mock.method(globalThis,'fetch',async (url,init={})=>{
    if (url.includes('/audit-logs/client-errors')) return Response.json({data:{}});
    calls.push({url,method:init.method||'GET'});
    if (calls.length===1) return pending;
    return Response.json({code:'VALIDATION_FAILED'},{status:422});
  });
  t.after(()=>{clearApiSession();if(originalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalStorage;});
  return {app,ui,calls,respond};
}

test('rapid submit actions start only one submission pipeline',async t=>{
  const f=setup(t);
  const first=checkinActions['checkin.submit'](f.app);
  const duplicate=checkinActions['checkin.submit'](f.app);
  f.respond(Response.json({code:'VALIDATION_FAILED'},{status:422}));
  await Promise.all([first,duplicate]);
  assert.equal(f.calls.length,1);
  assert.equal(f.ui.finish.submitting,false);
  assert.ok(f.ui.finish.error);
  assert.equal(f.ui.drafts.length,1);
});

for (const outcome of ['success','failure']) test(`late ${outcome} after account change cannot continue or update the new account`,async t=>{
  const f=setup(t), work=checkinActions['checkin.submit'](f.app);
  f.app.state.workspace.student.id='other';
  f.app.ui={};
  clearApiSession();
  const renders=f.app.renders;
  f.respond(outcome==='success' ? Response.json({data:[],meta:{pagination:{nextCursor:null}}}) : Response.json({code:'VALIDATION_FAILED'},{status:422}));
  await work;
  assert.equal(f.calls.length,1);
  assert.equal(f.app.renders,renders);
  assert.equal(loadSession('other'),null);
  assert.equal(loadSession('student').serverId,'session');
  assert.deepEqual(f.app.ui,{});
});

test('expired authentication unlocks the current form and preserves its proof and description',async t=>{
  const f=setup(t), work=checkinActions['checkin.submit'](f.app);
  clearApiSession();
  f.respond(Response.json({code:'AUTH_SESSION_REQUIRED'},{status:401}));
  await work;
  assert.equal(f.ui.finish.submitting,false);
  assert.ok(f.ui.finish.error);
  assert.equal(f.ui.drafts.length,1);
  assert.equal(loadSession('student').details.description,'Completed exercise');
  assert.equal(f.calls.length,1);
});

test('a normal submission completes once and persists the server result',async t=>{
  const f=setup(t), requests=[];
  f.app.reloadApiWorkspace=()=>{f.app.reloads=(f.app.reloads||0)+1;};
  const record={id:'record',sessionId:'session',status:'DRAFT',description:'Completed exercise',version:2};
  t.mock.method(globalThis,'fetch',async(url,init={})=>{
    requests.push({url,method:init.method||'GET',body:init.body&&JSON.parse(init.body)});
    if (url.split('?')[0].endsWith('/exercise-records')) return Response.json({data:[record],meta:{pagination:{nextCursor:null}}});
    if (url.endsWith('/evidence-context')) return Response.json({data:{sessionId:'session',mediaIds:[]}});
    if (url.endsWith('/submit')) return Response.json({data:{...record,status:'SUBMITTED',version:3,creditedMinutes:32}});
    throw new Error('Unexpected request '+url);
  });
  await checkinActions['checkin.submit'](f.app);
  assert.equal(f.ui.finish.submitting,false);
  assert.equal(f.ui.finish.error,null);
  assert.equal(loadSession('student').phase,'submitted');
  assert.equal(f.ui.freshRecordId,'record');
  assert.equal(f.app.reloads,1);
  assert.equal(requests.filter(r=>r.method==='POST').length,1);
  assert.deepEqual(requests.at(-1).body.mediaIds,['media']);
});
