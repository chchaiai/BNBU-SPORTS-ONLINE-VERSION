import test from 'node:test';
import assert from 'node:assert/strict';
import {slidePosition,connectSlideEnd} from './js/checkin-slide-end.js';
import {buildLocalPreviewWorkspace} from './js/local-preview.js';
import {saveSession,loadSession} from './js/session.js';
import {renderCheckIn,checkinActions} from './js/screens/checkin.js';
import {storeAuthSession,clearApiSession} from './js/api.js';

function eventHost() {
  const listeners=new Map();
  return {addEventListener(type,handler) {const rows=listeners.get(type)||[];rows.push(handler);listeners.set(type,rows);},
    emit(type,data={}) {const event={preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...data};(listeners.get(type)||[]).forEach(fn=>fn(event));return event;}};
}
function bindingFixture(scale=1) {
  const callbacks=[];
  const win={...eventHost(),setTimeout(fn){callbacks.push(fn);return callbacks.length;},clearTimeout(){}};
  const doc={...eventHost(),defaultView:win,hidden:false};
  const root={dataset:{checkinPhase:'paused'}}, label={style:{}},trail={style:{}};
  const attrs={'aria-disabled':'false'};
  const rect={left:100,top:100,right:100+240*scale,bottom:100+56*scale,width:240*scale};
  const track={dataset:{slidePhase:'idle'},clientWidth:240,isConnected:true,
    setAttribute(key,value){attrs[key]=value;},getAttribute(key){return attrs[key];},removeAttribute(key){delete attrs[key];},
    closest:s=>s==='[data-checkin-page]'?root:s==='[data-slide-end]'?track:null,
    querySelector:s=>s==='[data-slide-thumb]'?thumb:s==='[data-slide-label]'?label:trail,
    getBoundingClientRect:()=>rect,setPointerCapture(){},hasPointerCapture:()=>false,focus(){}};
  const thumb={style:{},closest:s=>s==='[data-slide-thumb]'?thumb:s==='[data-slide-end]'?track:null,
    getBoundingClientRect:()=>({left:104,top:104,right:152,bottom:152})};
  const viewport={...eventHost(),ownerDocument:doc,querySelector:()=>root};
  let completions=0,fallbacks=0;
  const app={state:{},ui:{},actions:{'checkin.requestFinish':(_app,_track,event)=>event.type==='checkin-slide-complete'?completions++:fallbacks++}};
  connectSlideEnd(viewport,app);
  const pointer={target:thumb,pointerId:1,button:0,isPrimary:true,clientX:128,clientY:128};
  const start=()=>viewport.emit('pointerdown',pointer);
  const move=x=>doc.emit('pointermove',{...pointer,clientX:x});
  const up=x=>doc.emit('pointerup',{...pointer,clientX:x});
  return {viewport,doc,win,app,track,thumb,trail,label,attrs,pointer,start,move,up,completed:()=>completions,fallbacks:()=>fallbacks,flush:()=>callbacks.splice(0).forEach(fn=>fn())};
}

test('slider follows the grabbed point one to one, including display scaling and overshoot',()=>{
  assert.equal(slidePosition(180,100,1,24,184),52);
  assert.equal(slidePosition(260,100,2,24,184),52);
  assert.equal(slidePosition(900,100,1,24,184),184);
  assert.equal(slidePosition(0,100,1,24,184),0);
});
test('a tap or stationary hold does not end; only dragging to the edge and releasing commits once',()=>{
  const f=bindingFixture();f.start();
  assert.equal(f.thumb.style.transform,'translateX(0px)');assert.equal(f.completed(),0);
  f.up(128);f.flush();assert.equal(f.completed(),0);
  f.start();f.move(220);assert.equal(f.thumb.style.transform,'translateX(92px)');assert.equal(f.attrs['aria-valuenow'],'50');
  f.move(312);assert.equal(f.completed(),0);f.up(312);assert.equal(f.completed(),1);assert.equal(f.track.dataset.slidePhase,'pending');
  f.flush();f.start();f.up(312);assert.equal(f.completed(),1);
});
test('touching the track beyond the thumb cannot jump to the end',()=>{
  const f=bindingFixture();f.viewport.emit('pointerdown',{...f.pointer,target:f.track,clientX:330});f.up(330);
  assert.equal(f.completed(),0);assert.equal(f.track.dataset.slidePhase,'idle');
  assert.equal(f.viewport.emit('click',{target:f.track,detail:1}).stopped,true);
});
test('reversing before release and cancelling at the far edge do not finish',()=>{
  const f=bindingFixture();f.start();f.move(312);f.move(200);f.up(200);
  assert.equal(f.completed(),0);assert.equal(f.thumb.style.transform,'translateX(0px)');
  f.flush();f.start();f.move(312);f.doc.emit('pointercancel',f.pointer);assert.equal(f.completed(),0);
});
test('vertical escape, lost capture, background, resize and DOM replacement reset the gesture',()=>{
  for(const cancel of [f=>f.doc.emit('pointermove',{...f.pointer,clientX:312,clientY:200}),
    f=>f.viewport.emit('lostpointercapture',f.pointer),f=>{f.doc.hidden=true;f.doc.emit('visibilitychange');},
    f=>f.win.emit('resize'),f=>{f.track.isConnected=false;connectSlideEnd(f.viewport,f.app);},
    f=>{f.app.state.dialog={};f.move(312);}]) {
    const f=bindingFixture();f.start();f.move(220);cancel(f);f.up(312);
    assert.equal(f.completed(),0);assert.equal(f.track.dataset.slidePhase,'idle');assert.equal(f.thumb.style.transform,'translateX(0px)');
  }
});
test('keyboard arrows expose progress, Escape cancels and End commits; Enter uses confirmation',()=>{
  const f=bindingFixture(),key=key=>f.viewport.emit('keydown',{target:f.track,key});
  key('ArrowRight');assert.equal(f.attrs['aria-valuenow'],'10');key('Escape');assert.equal(f.attrs['aria-valuenow'],'0');
  key('Enter');assert.equal(f.fallbacks(),1);assert.equal(f.completed(),0);
  key('End');assert.equal(f.completed(),1);assert.equal(f.attrs['aria-busy'],'true');
});
test('a second pointer and a disabled slider cannot take over the drag',()=>{
  const f=bindingFixture();f.start();f.doc.emit('pointermove',{...f.pointer,pointerId:2,clientX:312});
  assert.equal(f.attrs['aria-valuenow'],'0');f.up(128);f.flush();f.attrs['aria-disabled']='true';f.start();f.up(312);assert.equal(f.completed(),0);
});
test('assistive activation retains a confirmation path',()=>{
  const f=bindingFixture();assert.equal(f.viewport.emit('click',{target:f.track,detail:0}).stopped,undefined);
});

function sessionFixture(t, minutes) {
  const memory = new Map();
  globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
  t.after(() => delete globalThis.localStorage);
  const workspace = buildLocalPreviewWorkspace(), owner = workspace.student.id;
  const app = { state: { workspace, tab: 'checkin' }, ui: {}, isApiMode: () => false, isLocalPreview: () => true, hasActiveEnrollment: () => true, isWriteAllowed: () => true,
    render() {}, showDialog(dialog) { this.state.dialog = dialog; } };
  saveSession(owner, { phase: 'paused', startedAt: Date.now() - minutes * 60000, accumulatedMs: minutes * 60000, maximumDurationSeconds: 7200, details: { creditType: 'general', sportType: 'running', description: '' } });
  renderCheckIn(app);
  return { app, owner };
}
test('a completed slide ends an eligible local session without a duplicate confirmation', t => {
  const { app, owner } = sessionFixture(t, 35);
  checkinActions['checkin.requestFinish'](app, null, { type: 'checkin-slide-complete' });
  assert.equal(loadSession(owner).phase, 'finished'); assert.equal(app.state.dialog, undefined);
});
test('a completed slide below the minimum keeps the original warning and leaves the session paused', t => {
  const { app, owner } = sessionFixture(t, 1);
  checkinActions['checkin.requestFinish'](app, null, { type: 'checkin-slide-complete' });
  assert.equal(loadSession(owner).phase, 'paused'); assert.match(app.state.dialog.body, /不会形成打卡记录/);
  const key=app.state.dialog.motionId;
  assert.equal(app.state.dialog.motion,'checkin-end');
  assert.match(renderCheckIn(app),/data-slide-phase="confirming"[^>]*aria-valuenow="100"[^>]*aria-disabled="true"/);
  assert.equal(app.state.dialog.motionId,key);
  assert.doesNotMatch(renderCheckIn(app),/data-slide-phase="confirming"[^>]*aria-busy/);
  app.state.dialog=null;
  assert.match(renderCheckIn(app),/data-slide-phase="idle"[^>]*aria-valuenow="0"/);
  assert.equal(loadSession(owner).phase,'paused');
});
test('the fallback confirmation and disabled state remain available', t => {
  const { app, owner } = sessionFixture(t, 35);
  checkinActions['checkin.requestFinish'](app); assert.ok(app.state.dialog); assert.equal(loadSession(owner).phase, 'paused');
  app.ui.checkin.sessionTransitioning = true;
  assert.match(renderCheckIn(app), /data-slide-end[^>]*aria-disabled="true"/);
});

for (const outcome of ['success','failure']) test(`end capsule waits for the server and unlocks after ${outcome}`, async t => {
  const {app,owner} = sessionFixture(t,35);
  storeAuthSession({accessToken:'test',refreshToken:'test',accessTokenExpiresAt:'2099-01-01T00:00:00Z',user:{id:owner}});
  t.after(()=>clearApiSession());
  app.isApiMode=()=>true; app.isLocalPreview=()=>false;
  const local=loadSession(owner); Object.assign(local,{serverId:'hold-session',enrollmentId:'hold-enrollment',serverVersion:1}); saveSession(owner,local);
  let respond,finishDone,finishRequested;
  const response=new Promise(resolve=>{respond=resolve;}),done=new Promise(resolve=>{finishDone=resolve;}),requested=new Promise(resolve=>{finishRequested=resolve;});
  let calls=0;
  app.render=()=>{if(app.ui.checkin.endingSession===false)finishDone();};
  t.mock.method(globalThis,'fetch',async(url)=>{
    if(String(url).includes('/audit-logs/client-errors'))return Response.json({data:{}});
    if(String(url).endsWith('/hold-session'))return Response.json({data:{id:'hold-session',enrollmentId:'hold-enrollment',version:1,status:'PAUSED'}});
    if(String(url).endsWith('/finish')){calls++;finishRequested();return response;}
    throw new Error(`Unexpected ${url}`);
  });
  checkinActions['checkin.requestFinish'](app,null,{type:'checkin-slide-complete'});
  await requested;
  assert.equal(loadSession(owner).phase,'paused');
  assert.match(renderCheckIn(app),/data-slide-phase="pending"[^>]*aria-disabled="true"[^>]*aria-busy="true"/);
  checkinActions['checkin.requestFinish'](app,null,{type:'checkin-slide-complete'}); assert.equal(calls,1);
  respond(outcome==='success' ? Response.json({data:{id:'hold-session',enrollmentId:'hold-enrollment',version:2,status:'COMPLETED',actualDurationSeconds:2100,endedAt:new Date().toISOString()}}) : Response.json({code:'VALIDATION_FAILED',requestId:'hold-test'},{status:422}));
  await done;
  assert.equal(app.ui.checkin.endingSession,false); assert.equal(app.ui.checkin.sessionTransitioning,false);
  assert.equal(loadSession(owner).phase,outcome==='success'?'finished':'paused');
  if(outcome==='failure') {assert.match(app.state.dialog.title,/结束运动失败/);assert.match(renderCheckIn(app),/data-slide-phase="idle"/);}
});
