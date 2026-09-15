import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const studentOrigin=process.env.STUDENT_ORIGIN || 'http://127.0.0.1:4274';
const teacherOrigin=process.env.TEACHER_ORIGIN || 'http://localhost:3300';
const evidence=process.env.BUG15_EVIDENCE || 'evidence/bug-20260915';fs.mkdirSync(evidence,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto(studentOrigin+'/student/');
 const maintenance=process.env.BUG15_MAINTENANCE==='1';
 if(maintenance){await page.getByText('系统维护通知',{exact:true}).waitFor();await page.screenshot({path:evidence+'/student-maintenance.png',fullPage:true});}else{
 const consent=page.getByRole('button',{name:'同意并继续'});await consent.waitFor({timeout:15000});await consent.click();
 await page.getByText('直接登录',{exact:true}).click();
 const brand=page.getByRole('link',{name:'Powered by Verity AI'});await brand.waitFor();
 assert.equal(await brand.getAttribute('href'),'https://verityai.cn/');
 await brand.locator('img').evaluate(image=>image.decode());
 assert.equal(await brand.locator('img').evaluate(image=>image.complete&&image.naturalWidth>0),true);
 await brand.scrollIntoViewIfNeeded();await page.screenshot({path:evidence+'/student-login.png',fullPage:true});
 const teacher=await browser.newPage();await teacher.goto(teacherOrigin+'/');
 const teacherBrand=teacher.getByRole('link',{name:'Powered by Verity AI'});await teacherBrand.waitFor();
 assert.equal(await teacherBrand.getAttribute('href'),'https://verityai.cn/');
 await teacherBrand.locator('img').evaluate(image=>image.decode());
 assert.equal(await teacherBrand.locator('img').evaluate(image=>image.complete&&image.naturalWidth>0),true);
 await teacher.screenshot({path:evidence+'/teacher-login.png',fullPage:true});
 }
 const video=await page.evaluate(async()=>{
  const {addDraftFromFile}=await import('/student/js/screens/checkin.js');
  const {loadProofDrafts}=await import('/student/js/checkin-drafts.js');
  const owner='bug15-local-'+crypto.randomUUID();
  const app={ui:{},state:{workspace:{student:{id:owner},courses:[]}},render(){},isApiMode(){return false;}};
  const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;const ctx=canvas.getContext('2d');
  const stream=canvas.captureStream(10);let frame=0;const timer=setInterval(()=>{ctx.fillStyle=frame++%2?'blue':'red';ctx.fillRect(0,0,160,90);},100);
  const recorder=new MediaRecorder(stream,{mimeType:'video/mp4;codecs=avc1'});const chunks=[];recorder.ondataavailable=e=>chunks.push(e.data);
  const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.start();await new Promise(resolve=>setTimeout(resolve,11200));recorder.stop();await stopped;
  clearInterval(timer);stream.getTracks().forEach(track=>track.stop());
  await addDraftFromFile(app,new File(chunks,'over-limit.mp4',{type:'video/mp4'}),'video',null,null,true);
  const stored=await loadProofDrafts(owner,'pending');
  return {drafts:app.ui.checkin.drafts.length,stored:stored.length,message:app.ui.checkin.captureError};
 });
 assert.equal(video.drafts,0);assert.equal(video.stored,0);assert.match(video.message,/10/);
 await page.evaluate(async()=>{
   const {SPORT_OPTIONS}=await import('/student/js/sports-catalog.js');const {icon}=await import('/student/js/icons.js');
   document.body.innerHTML='<main style="display:grid;grid-template-columns:repeat(6,1fr);gap:25px;padding:24px;background:white;color:#555">'+SPORT_OPTIONS.slice(0,24).map(sport=>`<div style="text-align:center"><div style="border-radius:50%;background:#e9e9ec;width:100px;height:100px;display:grid;place-items:center;margin:auto">${icon(sport.icon,64)}</div><p>${sport.zh}</p></div>`).join('')+'</main>';
 });
 await page.setViewportSize({width:1100,height:720});await page.screenshot({path:evidence+'/sport-icons.png',fullPage:true});
 console.log(JSON.stringify({check:'BUG15_REAL_BROWSER_BRANDING_AND_OVERLONG_VIDEO_STORAGE',result:'PASS',video,studentOrigin,teacherOrigin,branding:maintenance?'PENDING_MAINTENANCE':'PASS'}));
} finally {await browser.close();}
