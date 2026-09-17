import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {prepareJpegEvidence,photoCameraFields} from './js/photo-originals.js';
const require=createRequire(new URL('../../../backend/package.json',import.meta.url));
const sharp=require('sharp'),exifr=require('exifr');
test('upload copy preserves pixels and camera time while the original retains all EXIF',async()=>{
 const original=await sharp({create:{width:16,height:16,channels:3,background:'#bcd123'}}).jpeg().withExif({
  IFD0:{Make:'Camera',Model:'Test'},IFD2:{DateTimeOriginal:'2026:09:11 12:00:00'},
  IFD3:{GPSLatitudeRef:'N',GPSLatitude:'22/1 15/1 0/1',GPSLongitudeRef:'E',GPSLongitude:'113/1 30/1 0/1'}}).toBuffer();
 const file=new File([original],'original.jpg',{type:'image/jpeg'}),before=await file.arrayBuffer();
 const result=Buffer.from(await (await prepareJpegEvidence(file)).arrayBuffer());
 assert.deepEqual(await file.arrayBuffer(),before);
 const metadata=await exifr.parse(result,{reviveValues:false});
 assert.equal(metadata.DateTimeOriginal,'2026:09:11 12:00:00');assert.equal(metadata.Model,'Test');
 assert.equal(metadata.GPSLatitude,undefined);assert.equal(metadata.latitude,undefined);
 assert.ok((await exifr.parse(original)).GPSLatitude);
 assert.deepEqual(await sharp(result).raw().toBuffer(),await sharp(original).raw().toBuffer());
});
test('a camera image without EXIF remains a valid JPEG',async()=>{
 const image=await sharp({create:{width:8,height:8,channels:3,background:'#ffffff'}}).jpeg().toBuffer();
 const copy=await prepareJpegEvidence(new File([image],'plain.jpg',{type:'image/jpeg'}));
 assert.equal((await sharp(Buffer.from(await copy.arrayBuffer())).metadata()).width,8);
 assert.deepEqual(await photoCameraFields(copy),[]);
});
