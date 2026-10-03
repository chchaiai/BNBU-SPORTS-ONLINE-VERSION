import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeferredScreens } from './js/deferred-screens.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function fixture() {
  return {state:{subScreen:'help',subParams:{},authenticated:true},actions:{},renders:0,interceptors:[],
    render(){this.renders++;},registerBackInterceptor(fn){this.interceptors.push(fn);}};
}
test('deferred page shares its download, registers actions once, and preserves back protection', async () => {
  let resolve, calls=0;
  const back=()=>true, action=()=>42;
  const page=createDeferredScreens(()=>{calls++;return new Promise(r=>resolve=r);},'retry',{help:'render'},'actions','back');
  const app=fixture();
  assert.match(page.render(app),/role="status"/);
  page.render(app); await tick(); assert.equal(calls,1);
  resolve({render:()=>'<form>loaded</form>',actions:{save:action},back}); await tick();
  assert.equal(page.render(app),'<form>loaded</form>');
  assert.equal(app.actions.save,action); assert.deepEqual(app.interceptors,[back]);
  page.render(app); assert.equal(app.interceptors.length,1);
});
test('leaving a loading page or logging out prevents late render',async()=>{
  for(const logout of [false,true]) {
    let resolve;
    const page=createDeferredScreens(()=>new Promise(r=>resolve=r),'retry',{help:'render'},'actions');
    const app=fixture(); page.render(app); await tick();
    if(logout)app.state.authenticated=false; else app.state.subScreen=null;
    resolve({render:()=>'',actions:{}});await tick();assert.equal(app.renders,0);
  }
});
test('failed download preserves state and never refreshes automatically',async t=>{
  let calls=0;
  const page=createDeferredScreens(async()=>{if(++calls===1)throw new Error('offline');return {render:()=>'<form>ok</form>',actions:{}};},'retry',{help:'render'},'actions');
  const app=fixture();app.ui={draft:'keep'};page.render(app);await tick();
  assert.match(page.render(app),/role="alert"/);assert.equal(calls,1);
  let reloads=0;const previous=globalThis.location;
  globalThis.location={reload(){reloads++;}};t.after(()=>{globalThis.location=previous;});
  assert.equal(reloads,0);app.actions.retry();assert.equal(reloads,1);
  assert.equal(app.ui.draft,'keep');assert.equal(app.state.subScreen,'help');
});
