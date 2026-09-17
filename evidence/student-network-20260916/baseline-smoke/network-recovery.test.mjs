import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from './js/app.js';
import { getSystemModeStatus, normalizeSystemModeProjection, toUserFacingError, ClientTransportError, subscribeSystemMaintenance } from './js/api.js';
import { renderConnectionNotice } from './js/screens/startup.js';
const originalFetch = globalThis.fetch;
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
function online(value) { Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:value}}); }
test.afterEach(() => { globalThis.fetch=originalFetch; if(originalNavigator)Object.defineProperty(globalThis,'navigator',originalNavigator); else delete globalThis.navigator; });
test('offline and failed connections have distinct exact messages and retry entry',async()=>{
 for(const [connected,message] of [[false,'当前无网络连接，请检查网络后重试'],[true,'网络连接不稳定，请稍后重试']]) {
  online(connected);globalThis.fetch=async()=>{throw new TypeError('Failed to fetch');};
  app.state.systemMode='NORMAL';app.state.systemModeChecked=false;app.state.connectionError=null;
  await app.refreshSystemMode();
  assert.equal(app.state.systemMode,'NORMAL');assert.equal(app.state.systemModeChecked,false);
  const html=renderConnectionNotice(app,true);assert.ok(html.includes(message));assert.ok(html.includes('重新尝试'));assert.ok(!html.includes('维护'));
 }
});
test('ordinary HTTP failures and malformed projections never manufacture maintenance',async()=>{
 online(true);
 for(const response of [()=>new Response('Bad Gateway',{status:502}),()=>Response.json({code:'SYSTEM_SERVICE_UNAVAILABLE'},{status:503}),()=>Response.json({data:{mode:'READ_ONLY'}}),()=>Response.json({data:null})]) {
  app.state.systemMode='NORMAL';app.state.systemModeChecked=false;globalThis.fetch=async()=>response();await app.refreshSystemMode();
  assert.equal(app.state.systemMode,'NORMAL');assert.ok(app.state.connectionError);
 }
 assert.throws(()=>normalizeSystemModeProjection({}));
});
test('explicit maintenance state and error code still enter maintenance; retry recovers',async()=>{
 online(true);
 for(const response of [()=>Response.json({data:{mode:'MAINTENANCE'}}),()=>Response.json({code:'SYSTEM_MAINTENANCE'},{status:503})]) {
  globalThis.fetch=async()=>response();await app.refreshSystemMode();assert.equal(app.state.systemMode,'MAINTENANCE');
 }
 globalThis.fetch=async()=>{throw new TypeError('offline');};await app.refreshSystemMode();assert.equal(app.state.systemMode,'MAINTENANCE');
 globalThis.fetch=async()=>Response.json({data:{mode:'NORMAL'}});await app.retryConnection();
 assert.equal(app.state.systemMode,'NORMAL');assert.equal(app.state.connectionError,null);assert.equal(app.state.systemModeChecked,true);
});
test('timeout aborts stalled request and never emits maintenance',async(t)=>{
 online(true);let maintenance=0;const unsubscribe=subscribeSystemMaintenance(()=>maintenance++);
 t.mock.timers.enable({apis:['setTimeout']});
 globalThis.fetch=async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Timeout','AbortError'))));
 const result=getSystemModeStatus();const rejected=assert.rejects(result,e=>{assert.equal(toUserFacingError(e,{log:false}).message,'网络连接不稳定，请稍后重试');return true;});
 t.mock.timers.tick(20000);await rejected;assert.equal(maintenance,0);unsubscribe();
});
test('timeout during response body also fails as transport error',async(t)=>{
 online(true);t.mock.timers.enable({apis:['setTimeout']});
 globalThis.fetch=async(url,{signal})=>({ok:true,json:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Timeout','AbortError'))))});
 const pending=getSystemModeStatus();const rejected=assert.rejects(pending,ClientTransportError);
 await new Promise(resolve=>setImmediate(resolve));t.mock.timers.tick(20000);await rejected;
});
