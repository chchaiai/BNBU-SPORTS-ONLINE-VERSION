import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--no-proxy-server','--host-resolver-rules=MAP www.student.bnbusports.cn 43.129.193.7']});
try {
 const page=await browser.newPage({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (Linux; Android 14; HUAWEI) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36 EdgA/152.0.4191.65'});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const response=await page.goto('https://www.student.bnbusports.cn/student/');assert.equal(response.status(),200);
 const moduleStatus=await page.evaluate(async()=>{
   const camera=await import('/student/js/screens/checkin.js');const photo=await import('/student/js/photo-originals.js');
   return {native:camera.prefersDeviceCamera(),metadataReader:typeof photo.photoCameraFields};
 });
 assert.deepEqual(moduleStatus,{native:true,metadataReader:'function'});
 const chooserPending=page.waitForEvent('filechooser');
 await page.evaluate(async()=>{const {checkinActions}=await import('/student/js/screens/checkin.js');checkinActions['checkin.capturePhoto']({});});
 const chooser=await chooserPending;
 assert.equal(await chooser.element().getAttribute('accept'),'image/*');
 assert.equal(await chooser.element().getAttribute('capture'),'environment');
 assert.deepEqual(errors,[]);
 const result={result:'PASS',checkedAt:new Date().toISOString(),scope:'Public production page and deployed capture handler, emulated Android Edge user agent; no authenticated upload and no physical phone test',moduleStatus,deviceCameraRequested:true,pageErrors:errors};
 writeFileSync('evidence/photo-exif-20260917/browser-verification.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
} finally {await browser.close();}
