import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(fs.readFileSync('.local/v81-browser-state/state.json'));
const {recordId}=JSON.parse(fs.readFileSync('.local/v81-browser-state/camera-submission-positive-credit.json'));
const login=await fetch('http://127.0.0.1:3199/api/v1/auth/password-login',{method:'POST',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({account:state.accounts.teacher.email,password:state.accounts.teacher.password})});
assert.equal(login.status,200);const token=(await login.json()).data.accessToken;
const read=async path=>{const response=await fetch('http://127.0.0.1:3199/api/v1'+path,{headers:{authorization:`Bearer ${token}`}});assert.equal(response.status,200,path);return (await response.json()).data;};
const detail=await read(`/exercise-records/${recordId}`);
const student=await read(`/students/${detail.studentId}`);
const evidence=await read(`/exercise-records/${recordId}/evidence-context`);
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(60000);
try{
 await page.goto('http://localhost:3300/');await page.locator('#login-account').fill(state.accounts.teacher.email);await page.locator('#login-password').fill(state.accounts.teacher.password);await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.getByRole('button',{name:'打卡审核',exact:true}).click();await page.getByRole('tab',{name:/全部记录/}).click();
 await page.getByRole('row').filter({hasText:student.fullName}).getByRole('button',{name:/查看记录/}).click();
 const record=page.locator(`#checkin-record-${recordId}`);await record.waitFor();await record.locator('.checkin-description').click();
 const dialog=page.getByRole('dialog');const tabs=dialog.getByRole('tablist',{name:'选择要审核的凭证'}).getByRole('tab');
 assert.equal(await tabs.count(),2);const observed=[];
 for(let index=0;index<2;index++){
  await tabs.nth(index).click();await page.waitForFunction(()=>!!document.querySelector('.teacher-original-media img,.teacher-original-media video'));
  const container=dialog.locator('.teacher-original-media');const id=await container.getAttribute('data-media-id');
  const metadata=await read(`/media/${id}`);
  if(metadata.mediaType==='IMAGE'){
   await page.waitForFunction(()=>{const image=document.querySelector('.teacher-original-media img');return image?.complete&&image.naturalWidth>0;});
  }else{
   assert.equal(metadata.mediaType,'VIDEO');const video=container.locator('video');
   await video.evaluate(async element=>{element.muted=true;await element.play();});
   await page.waitForFunction(()=>{const video=document.querySelector('.teacher-original-media video');return video?.currentTime>1&&video.videoWidth>0&&!video.error;});
   await video.evaluate(element=>element.pause());
  }
  await dialog.screenshot({path:`.local/bugfix-evidence/teacher-real-${metadata.mediaType.toLowerCase()}.png`});
  observed.push({id,type:metadata.mediaType});
 }
 assert.equal(new Set(observed.map(item=>item.id)).size,2);
 assert.deepEqual(observed.map(item=>item.id).sort(),[...evidence.mediaIds].sort());
 assert.equal(await dialog.locator('img[src*="checkin-evidence-preview"]').count(),0);
 console.log(JSON.stringify({check:'TEACHER_ALL_REAL_CAPTURED_PHOTO_VIDEO_PLAYBACK',result:'PASS',recordId,observed}));
}catch(error){await page.screenshot({path:'.local/bugfix-evidence/teacher-video-failure.png',fullPage:true});throw error;}finally{await browser.close();}
