import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,
  args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
fs.mkdirSync('.local/round2-evidence',{recursive:true});
try {
  for (const fragmentedDuration of [false,true]) {
    const context=await browser.newContext({viewport:{width:390,height:740}}),page=await context.newPage();
    if(fragmentedDuration) await page.addInitScript(() => {
      const descriptor=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'duration');
      Object.defineProperty(HTMLMediaElement.prototype,'duration',{...descriptor,get(){
        return this.src.startsWith('blob:') ? Infinity : descriptor.get.call(this);
      }});
    });
    await page.goto('http://127.0.0.1:4274/student/?preview=student');
    await page.evaluate(async()=>{window.probeApp=(await import('/student/js/app.js')).app;});
    await page.waitForFunction(()=>window.probeApp.state.authenticated);
    await page.evaluate(()=>{window.probeApp.selectTab('checkin');window.probeApp.actions['checkin.videoNoticeContinue'](window.probeApp);});
    await page.locator('[data-action="checkin.cameraStartVideo"]:enabled').click();
    await page.waitForTimeout(2100);
    await page.locator('[data-action="checkin.cameraPauseVideo"]').click();
    await page.waitForTimeout(700);
    await page.locator('[data-action="checkin.cameraResumeVideo"]').click();
    await page.waitForTimeout(1100);
    await page.locator('[data-action="checkin.cameraStopVideo"]').click();
    await page.waitForFunction(()=>window.probeApp.ui.checkin.drafts.some(d=>d.type==='video'));
    const result=await page.evaluate(()=>{
      const ui=window.probeApp.ui.checkin,d=ui.drafts.find(d=>d.type==='video');
      return {duration:d.durationSeconds,bytes:d.byteCount,mime:d.mimeType,thumbnail:Boolean(d.thumbnailUrl),cameraClosed:ui.liveCamera.stream===null,error:ui.captureError};
    });
    assert.ok(result.duration>2&&result.duration<5);assert.ok(result.bytes>0&&result.thumbnail);assert.equal(result.mime,'video/mp4');assert.equal(result.cameraClosed,true);assert.equal(result.error,null);
    await page.evaluate(()=>{const app=window.probeApp,draft=app.ui.checkin.drafts.find(d=>d.type==='video');app.actions['checkin.previewDraft'](app,{dataset:{draftId:draft.id}});});
    const playback=page.locator('[data-proof-preview-video]');
    await playback.evaluate(async video=>{video.muted=true;await video.play();});
    await page.waitForFunction(()=>document.querySelector('[data-proof-preview-video]')?.currentTime>0.5);
    await page.screenshot({path:`.local/round2-evidence/video-${fragmentedDuration?'unbounded-metadata':'native'}.png`});
    console.log(JSON.stringify({check:'RECORD_PAUSE_RESUME_STOP_DECODE_MP4_DRAFT',status:'PASS',fragmentedDuration,...result}));
    await context.close();
  }
} finally {await browser.close();}
