import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../BNBU-Sports-Web-new/portal-teacher-admin/package.json',import.meta.url));
const QRCode=require('qrcode');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,
 args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
const checks=[];
try {
 const page=await browser.newPage({viewport:{width:390,height:740},isMobile:true});
 await page.goto('http://127.0.0.1:4274/student/?preview=student');
 await page.evaluate(async()=>{window.bugfixApp=(await import('/student/js/app.js')).app;});
 await page.waitForFunction(()=>window.bugfixApp.state.authenticated);
 await page.evaluate(async()=>{
  const {app}=await import('/student/js/app.js');
  app.selectTab('checkin');app.actions['checkin.capturePhoto'](app);
 });
 await page.locator('[data-action="checkin.cameraTakePhoto"]:enabled').waitFor();
 assert.equal(await page.locator('.bottom-nav-wrap').count(),0);
 await page.evaluate(()=>{window.oldCameraTrack=document.querySelector('[data-live-camera-video]').srcObject.getVideoTracks()[0];});
 await page.getByRole('button',{name:'切换摄像头',exact:true}).click();
 await page.locator('[data-action="checkin.cameraTakePhoto"]:enabled').waitFor();
 assert.equal(await page.evaluate(()=>window.oldCameraTrack.readyState),'ended');
 checks.push('photo-front-back-switch-releases-previous-stream');
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 await page.evaluate(async()=>{const {app}=await import('/student/js/app.js');app.actions['checkin.videoNoticeContinue'](app);});
 await page.locator('[data-action="checkin.cameraStartVideo"]:enabled').waitFor();
 await page.getByRole('button',{name:'开始录像',exact:true}).click();
 await page.evaluate(async()=>{
  const {app}=await import('/student/js/app.js');
  app.applySystemModeStatus({...app.state.systemModeStatus,mode:'NORMAL'});
  window.cameraNode=document.querySelector('[data-live-camera-video]');
  for(let i=0;i<3;i++) app.applySystemModeStatus({...app.state.systemModeStatus});
 });
 await page.waitForTimeout(12000);
 assert.equal(await page.evaluate(()=>window.cameraNode===document.querySelector('[data-live-camera-video]')),true);
 assert.equal(await page.locator('.bottom-nav-wrap').count(),0);
 const camera=await page.evaluate(async()=>{
  const {app}=await import('/student/js/app.js');
  const video=document.querySelector('[data-live-camera-video]');
  return {state:app.ui.checkin.liveCamera.recorder.state,ready:video.readyState,width:video.videoWidth};
 });
 assert.equal(camera.state,'recording');assert.ok(camera.ready>=2&&camera.width>0);
 fs.mkdirSync('.local/bugfix-evidence',{recursive:true});
 await page.screenshot({path:'.local/bugfix-evidence/mobile-video.png'});
 checks.push('12-second-video-survives-unchanged-system-polls-without-navigation-overlay');
 await page.evaluate(async()=>{const {app}=await import('/student/js/app.js');app.actions['checkin.cameraClose'](app);});
 // Real QR encoder/decoder roundtrip without native BarcodeDetector.
 const text='invite_0123456789abcdef.secret_0123456789abcdef';
 const url=await QRCode.toDataURL(text,{width:500,margin:4});
 await page.addScriptTag({url:'http://127.0.0.1:4274/student/js/vendor/jsQR.js'});
 const decoded=await page.evaluate(async url=>{
  const image=new Image();image.src=url;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
  return window.jsQR(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height)?.data;
 },url);
 assert.equal(decoded,text);checks.push('teacher-qrcode-library-to-bundled-student-decoder-roundtrip');
 console.log(JSON.stringify({scope:'local-browser-UI-with-synthetic-camera',status:'PASS',checks}));
}finally{await browser.close();}
