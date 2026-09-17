import assert from 'node:assert/strict';
import {test} from 'node:test';
import {checkinActions,prefersDeviceCamera} from './js/screens/checkin.js';

test('Android Edge uses device capture while desktop Edge retains the live camera',()=>{
  assert.equal(prefersDeviceCamera('Mozilla/5.0 (Linux; Android 14) EdgA/152.0.4191.65'),true);
  assert.equal(prefersDeviceCamera('Mozilla/5.0 (HarmonyOS; HUAWEI) Edg/152.0.4191.65'),true);
  assert.equal(prefersDeviceCamera('Mozilla/5.0 (Windows NT 10.0) Edg/152.0'),false);
  assert.equal(prefersDeviceCamera('Mozilla/5.0 (iPhone) EdgiOS/152.0'),true);
});
test('Edge capture opens the native video input synchronously and releases it on cancellation',()=>{
  const originalDocument=globalThis.document;
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  let clicked=false,removed=false,appended=false;
  const input={style:{},setAttribute(name,value){this[name]=value;},click(){clicked=true;},remove(){removed=true;}};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:'Android EdgA/152.0.4191.65'}});
  globalThis.document={createElement:()=>input,body:{append(){appended=true;}}};
  try {
    checkinActions['checkin.captureVideo']({});
    assert.equal(clicked,true);assert.equal(appended,true);assert.equal(input.accept,'video/*');assert.equal(input.capture,'environment');
    input.oncancel();assert.equal(removed,true);
  } finally {
    globalThis.document=originalDocument;
    if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;
  }
});
