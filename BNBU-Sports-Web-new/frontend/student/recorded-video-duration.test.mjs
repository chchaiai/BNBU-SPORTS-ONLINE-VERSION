import test from 'node:test';
import assert from 'node:assert/strict';
import {finalizedMp4Duration} from './js/recorded-video.js';
function movie(version,{scale=1000,duration=7400,extended=false}={}) {
 const header=extended?16:8,payload=version?32:20;
 const bytes=new Uint8Array(8+header+payload),v=new DataView(bytes.buffer);
 v.setUint32(0,bytes.length);bytes.set([109,111,111,118],4);
 v.setUint32(8,extended?1:header+payload);bytes.set([109,118,104,100],12);
 if(extended)v.setBigUint64(16,BigInt(header+payload));
 const start=8+header;bytes[start]=version;const base=start+(version?20:12);
 v.setUint32(base,scale);if(version)v.setBigUint64(base+4,BigInt(duration));else v.setUint32(base+4,duration);
 return bytes;
}
test('finalized MP4 duration supports both movie header versions and extended atoms',()=>{
 for(const version of [0,1])for(const extended of [false,true])assert.equal(finalizedMp4Duration(movie(version,{extended})),7.4);
});
test('truncated MP4 headers and invalid time scales cannot produce accepted durations',()=>{
 const bytes=movie(1);for(let i=0;i<bytes.length;i++)assert.equal(finalizedMp4Duration(bytes.subarray(0,i)),null);
 assert.equal(finalizedMp4Duration(movie(0,{scale:0})),null);
 assert.equal(finalizedMp4Duration(movie(0,{duration:0})),null);
});
