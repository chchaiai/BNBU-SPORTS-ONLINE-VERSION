import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./browser-metrics.js',import.meta.url),'utf8');
function environment(host='www.student.bnbusports.cn',random=5){
  const calls=[],timers=[],events={};
  const context={location:{hostname:host,search:'?secret=DO_NOT_SEND'},URLSearchParams,Uint32Array,
    crypto:{getRandomValues:a=>{a[0]=random;a[1]=123;return a;}},document:{readyState:'complete'},
    performance:{getEntriesByType:type=>type==='navigation'?[{domainLookupStart:10,domainLookupEnd:20,connectStart:20,secureConnectionStart:30,connectEnd:60,requestStart:60,responseStart:90,responseEnd:110,loadEventEnd:300,nextHopProtocol:'h2',type:'navigate'}]:[{name:'https://private/resource?token=secret',transferSize:100}],getEntriesByName:()=>[{startTime:200}]},
    setTimeout:fn=>timers.push(fn),addEventListener:(name,fn)=>events[name]=fn,fetch:(url,options)=>{calls.push({url,options});return Promise.resolve();}};
  vm.runInNewContext(source,context);return {calls,timers,events};
}
test('metrics send once, exclude credentials and raw URLs, and separate handshake from server wait',()=>{
  const {calls,timers,events}=environment();timers.forEach(fn=>fn());events.pagehide();assert.equal(calls.length,1);
  const {url,options}=calls[0];assert.doesNotMatch(url,/secret|token|private|resource/);assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');
  const query=new URLSearchParams(url.split('?')[1]);assert.equal(query.get('dns'),'10');assert.equal(query.get('tls'),'30');assert.equal(query.get('wait'),'30');
});
test('local previews and unsampled navigations do not emit telemetry',()=>{
  assert.equal(environment('localhost').timers.length,0);assert.equal(environment(undefined,6).timers.length,0);
});
