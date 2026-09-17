import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
import {createTestPrisma} from '../../backend/test/helpers/database.ts';
import {seedExerciseSessionStudent} from '../../backend/test/helpers/exercise-session.ts';
import {TEST_PASSWORD} from '../../backend/test/helpers/test-environment.ts';
const maintenanceTest=process.argv.includes('--maintenance');
const evidencePrefix=maintenanceTest?'maintenance-upload':'upload';
const state=JSON.parse(await fs.readFile('.local/demand-six-browser-state.json','utf8'));
const prisma=createTestPrisma('postgresql://bnbu_test:demand-local-test-only@127.0.0.1:55433/bnbu_sports_test?schema=public');
const student=await seedExerciseSessionStudent(prisma,state.fixture,'UPLOAD-'+randomUUID());
await prisma.$executeRaw`UPDATE v81_course_rules SET minimum_minutes=1,version=version+1 WHERE class_section_id=${state.fixture.teacherAActiveSectionId}::uuid`;
await prisma.$disconnect();
const require=createRequire(new URL('../../backend/package.json',import.meta.url));
const sharp=require('sharp'),{PDFDocument}=require('pdf-lib');
const png=await sharp(randomBytes(512*512*3),{raw:{width:512,height:512,channels:3}}).png().toBuffer();
const pdf=await PDFDocument.create();const embedded=await pdf.embedPng(png);pdf.addPage([512,512]).drawImage(embedded,{x:0,y:0,width:512,height:512});
const pdfBytes=Buffer.from(await pdf.save());
let adminToken,maintenanceVersion;
async function adminRequest(path,body){const response=await fetch(state.baseUrl+'/api/v1'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','idempotency-key':randomUUID(),...(adminToken?{authorization:`Bearer ${adminToken}`}:{})},...(body?{body:JSON.stringify(body)}:{})});const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value.data;}
if(maintenanceTest){
 adminToken=(await adminRequest('/auth/password-login',{account:state.fixture.adminEmail,password:TEST_PASSWORD})).accessToken;
 const current=await adminRequest('/system-mode');if(current.mode==='MAINTENANCE')await adminRequest('/system-mode/changes',{mode:'NORMAL',reason:'Reset previous synthetic browser run',expectedVersion:current.policyVersion});
}
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
try{
 const context=await browser.newContext({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',viewport:{width:390,height:844},isMobile:true,hasTouch:true,permissions:['camera','microphone']});
 const page=await context.newPage();
 await page.goto(state.baseUrl+'/student/?org='+encodeURIComponent(state.organizationCode));
 await page.locator('[data-action="consent.agree"]').click();await page.locator('[data-action="guide.skip"]').click();
 await page.locator('[data-action="login.email"]').click();await page.locator('#vlogin-contact').fill(student.email);
 const sent=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/auth/student-sign-in-codes'));
 await page.locator('[data-action="verification.sendCode"]').click();assert.equal((await sent).status(),202);
 let code;for(let i=0;i<30&&!code;i++){
  const messages=await(await fetch('http://127.0.0.1:58025/api/v1/messages?limit=50')).json();
  const message=messages.messages?.find(item=>JSON.stringify(item.To??[]).includes(student.email));
  if(message){const detail=await(await fetch('http://127.0.0.1:58025/api/v1/message/'+message.ID)).json();code=String(detail.Text??'').match(/(?:code is|验证码是)\s*(\d{4,10})/u)?.[1];}
  if(!code)await new Promise(resolve=>setTimeout(resolve,500));
 }
 assert.ok(code);await page.locator('#vlogin-code').fill(code);await page.locator('[data-action="verification.submit"]').click();
 await page.locator('[data-action="guide.skip"]').click();

 await page.locator('[data-action="root.tab"][data-tab="checkin"]').click();
 await page.locator('[data-action="checkin.start"]').click();
 await page.locator('[data-action="checkin.ackHealth"]').click();
 await page.locator('[data-action="checkin.capturePhoto"]').waitFor();
 assert.equal(await page.locator('[data-action="checkin.capturePhoto"]').count(),1);
 assert.equal(await page.locator('[data-action="checkin.captureVideo"]').count(),1);
 assert.equal(await page.locator('[data-change="checkin.nativeVideo"]').count(),0);
 let chooser=page.waitForEvent('filechooser');await page.locator('[data-action="checkin.captureVideo"]').click();
 await (await chooser).setFiles('evidence/demand-1-6-20260917/long.mp4');
 await page.getByText('素材已超过十秒，请拍摄小于10秒的素材',{exact:true}).waitFor();
 assert.equal(await page.locator('[data-action="checkin.previewDraft"]').count(),0);
 chooser=page.waitForEvent('filechooser');await page.locator('[data-action="checkin.captureVideo"]').click();
 await (await chooser).setFiles('evidence/demand-1-6-20260917/short.mp4');
 await page.locator('[data-action="checkin.previewDraft"]').waitFor({timeout:25000});
 await page.screenshot({path:'evidence/demand-1-6-20260917/video-captured.png',fullPage:true});
 await page.waitForTimeout(60000);
 await page.locator('[data-action="checkin.requestFinish"]').click();
 await page.locator('[data-action="checkin.confirmFinish"]').click();
 await page.locator('#checkin-description').fill('Synthetic real browser video upload acceptance');
 await page.evaluate(()=>{window.uploadLabels=[];new MutationObserver(()=>{const text=document.querySelector('[data-checkin-upload-status]')?.textContent?.trim();if(text&&window.uploadLabels.at(-1)!==text)window.uploadLabels.push(text);}).observe(document.body,{subtree:true,childList:true,characterData:true});});
 const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:20,downloadThroughput:2097152,uploadThroughput:65536});
 const puts=[];page.on('response',r=>{if(r.request().method()==='PUT'&&r.url().includes('/minio/'))puts.push(r.status());});
 const submitted=page.waitForResponse(r=>r.request().method()==='POST'&&/\/exercise-records\/[^/]+\/submit$/.test(r.url()),{timeout:120000});submitted.catch(()=>{});
 await page.locator('[data-action="checkin.submit"]').click();
 await page.locator('.evidence-upload-loader').waitFor();await page.screenshot({path:'evidence/demand-1-6-20260917/progress.png'});
 try {
 const response=await submitted;assert.equal(response.status(),200,await response.text());
 const labels=await page.evaluate(()=>window.uploadLabels);assert.deepEqual(puts,[200]);
 assert.ok(labels.some(label=>/上传 [1-9][0-9]?%/.test(label)),'Visible measured upload progress');
 assert.equal((await response.json()).data.workflowStage,'VALID');
 await page.waitForFunction(()=>!document.querySelector('[data-checkin-upload-status]'));
 await page.screenshot({path:'evidence/demand-1-6-20260917/video-submitted.png',fullPage:true});
 await fs.writeFile('evidence/demand-1-6-20260917/video-result.json',JSON.stringify({status:'PASS',completionStatusCleared:true,nativeFileChooser:true,syntheticVideo:true,longVideoRejected:true,realElapsedSeconds:62,realMinioPuts:puts,submitStatus:response.status(),labels},null,2));
 }catch(error){console.log((await page.locator('body').innerText()).slice(-2400));throw error;}
}finally{await browser.close();}
