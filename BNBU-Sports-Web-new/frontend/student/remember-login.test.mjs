import test from 'node:test';
import assert from 'node:assert/strict';
import {app} from './js/app.js';
import {localStore} from './js/store.js';
import {emptyWorkspace} from './js/data.js';
import {storeAuthSession,clearApiSession,hasApiSession,currentApiUserId,request,contractRequest} from './js/api.js';
const memory=new Map();
globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)};
const session=(id='remembered')=>({sessionId:id,accessToken:'access-'+id,refreshToken:'refresh-'+id,accessTokenExpiresAt:'2099-01-01T00:00:00Z',refreshTokenExpiresAt:'2099-02-01T00:00:00Z',user:{id,role:'STUDENT',status:'ACTIVE'}});
function setup(){clearApiSession();memory.clear();storeAuthSession(session());localStore.setSession({kind:'api',accountId:'synthetic-number'});return {...app,state:{...app.state,authenticated:true,isRestoringSession:true,workspace:emptyWorkspace()},ui:{},render(){this.renders=(this.renders||0)+1;}};}
test('a fresh module recovers persistent credentials after closing the page',async()=>{
 setup();const fresh=await import('./js/api.js?restart='+Date.now());assert.equal(fresh.hasApiSession(),true);assert.equal(fresh.currentApiUserId(),'remembered');
});
test('missing or damaged presentation marker is rebuilt without another sign-in',()=>{
 for(const raw of [null,'{broken']){
 const shell=setup();if(raw===null)memory.delete('bnbu.student.web.session');else memory.set('bnbu.student.web.session',raw);
 assert.equal(shell.isApiMode(),true);let restored=0;shell.reloadApiWorkspace=()=>{restored++;};assert.equal(shell.restoreRememberedSession(),true);assert.equal(restored,1);assert.equal(shell.state.authenticated,true);assert.equal(localStore.getSession().kind,'api');assert.equal(localStore.getSession().accountId,null);
 }
});
test('verified identity repairs the display marker using the server student number',async()=>{
 const shell=setup();localStore.setSession({kind:'api',accountId:null});
 const identity={me:{user:{status:'PENDING_CONTACT_BINDING'}},profile:{studentNumber:'verified-number'},student:{emailVerified:false}};
 assert.equal(await shell.reloadApiWorkspace(identity),true);assert.equal(localStore.getSession().accountId,'verified-number');
});
test('offline startup retains login and finishes loading so retry remains available',async()=>{
 const shell=setup(),previous=globalThis.fetch;globalThis.fetch=async()=>{throw new TypeError('offline');};
 try{assert.equal(await shell.reloadApiWorkspace(),false);assert.equal(hasApiSession(),true);assert.equal(shell.state.authenticated,true);assert.equal(shell.state.isLoading,false);}finally{globalThis.fetch=previous;}
});
test('a non-terminal 401 does not destroy the remembered session',async()=>{
 const shell=setup(),previous=globalThis.fetch;globalThis.fetch=async()=>Response.json({code:'AUTH_VERIFICATION_CODE_INVALID'},{status:401});
 try{await shell.reloadApiWorkspace();assert.equal(hasApiSession(),true);assert.equal(shell.state.authenticated,true);assert.equal(shell.state.isLoading,false);}finally{globalThis.fetch=previous;}
});
test('revoked and disabled sessions return to sign-in without a stuck loading shell',async()=>{
 for(const [status,code] of [[401,'AUTH_SESSION_REVOKED'],[403,'AUTH_ACCOUNT_DISABLED']]){
 const shell=setup(),previous=globalThis.fetch;globalThis.fetch=async()=>Response.json({code},{status});
 try{await shell.reloadApiWorkspace();assert.equal(hasApiSession(),false);assert.equal(shell.state.authenticated,false);assert.equal(shell.state.isLoading,false);assert.equal(localStore.getSession(),null);}finally{globalThis.fetch=previous;}
 }
});
test('expired access credentials rotate automatically without user sign-in',async()=>{
 setup();storeAuthSession({...session(),accessTokenExpiresAt:'2000-01-01T00:00:00Z'});
 const previous=globalThis.fetch;let refreshes=0;
 globalThis.fetch=async(url,init)=>String(url).endsWith('/auth/refresh')?(refreshes++,Response.json({data:session('rotated')})):init.headers.Authorization==='Bearer access-rotated'?Response.json({data:{ok:true}}):Response.json({code:'AUTH_TOKEN_EXPIRED'},{status:401});
 try{assert.deepEqual(await request('/me'),{ok:true});assert.equal(refreshes,1);assert.equal(hasApiSession(),true);}finally{globalThis.fetch=previous;}
});
test('a delayed rejection from an old request cannot sign out a new login',async()=>{
 for(const send of [request,contractRequest]){
 setup();const previous=globalThis.fetch;let respond;globalThis.fetch=()=>new Promise(r=>{respond=r;});
 try{const pending=send('/me');storeAuthSession(session('new-login'));respond(Response.json({code:'AUTH_SESSION_REVOKED'},{status:401}));await assert.rejects(pending,/API_SESSION_EPOCH_CHANGED/);assert.equal(currentApiUserId(),'new-login');}finally{globalThis.fetch=previous;}
 }
});
test('explicit logout, removed site data and expired refresh credentials require sign-in',()=>{
 const shell=setup();shell.reloadApiWorkspace=()=>{throw new Error('Must not restore');};clearApiSession();assert.equal(shell.restoreRememberedSession(),false);
 storeAuthSession(session());memory.clear();assert.equal(shell.restoreRememberedSession(),false);
 storeAuthSession({...session(),refreshTokenExpiresAt:'2000-01-01T00:00:00Z'});assert.equal(shell.restoreRememberedSession(),false);
});

test('a login in another page also protects the new session from an older rejection',async()=>{
 setup();const other=await import('./js/api.js?other-page='+Date.now());const previous=globalThis.fetch;let respond;
 globalThis.fetch=()=>new Promise(r=>{respond=r;});
 try{const pending=request('/me');other.storeAuthSession(session('other-page'));respond(Response.json({code:'AUTH_SESSION_REVOKED'},{status:401}));await assert.rejects(pending,/API_SESSION_EPOCH_CHANGED/);assert.equal(currentApiUserId(),'other-page');}finally{globalThis.fetch=previous;}
});
