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
const state=JSON.parse(await fs.readFile('evidence/demand-20260916/browser/state.json','utf8'));
const prisma=createTestPrisma('postgresql://bnbu_test:demand-local-test-only@127.0.0.1:55433/bnbu_sports_test?schema=public');
const student=await seedExerciseSessionStudent(prisma,state.fixture,'UPLOAD-'+randomUUID());
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
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const context=await browser.newContext({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',viewport:{width:390,height:844},isMobile:true,hasTouch:true});
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
 await page.locator('[data-action="root.tab"][data-tab="profile"]').click();
 await page.locator('[data-action="profile.openExemption"]').click();
 await page.locator('[data-action="exemption.tab"][data-value="new"]').click();
 await page.locator('#exemption-reason').fill('Synthetic browser upload acceptance');
 await page.locator('#exemption-organization').fill('Synthetic Sports Team');
 await page.locator('input[data-exemption-input="gallery"]').setInputFiles([{name:'synthetic-proof.pdf',mimeType:'application/pdf',buffer:pdfBytes},{name:'synthetic-proof.png',mimeType:'image/png',buffer:png}]);
 await page.waitForTimeout(1000);
 await page.screenshot({path:`evidence/demand-20260916/browser/${evidencePrefix}-before.png`,fullPage:true});
 await page.evaluate(()=>{
  window.uploadLabels=[];
  new MutationObserver(()=>{const text=document.querySelector('[data-action="exemption.submit"]')?.textContent?.trim();if(text&&window.uploadLabels.at(-1)!==text)window.uploadLabels.push(text);}).observe(document.body,{subtree:true,childList:true,characterData:true});
 });
 const cdp=await context.newCDPSession(page);
 await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:20,downloadThroughput:2*1024*1024,uploadThroughput:128*1024});
 const uploadResponses=[];page.on('response',response=>{if(response.request().method()==='PUT'&&response.url().includes('/minio/'))uploadResponses.push(response.status());});
 if(maintenanceTest){
  let interrupted=false;
  await page.route('**/api/v1/media-uploads/*/confirm',async route=>{
   if(!interrupted){interrupted=true;const mode=await adminRequest('/system-mode');
    const current=await adminRequest('/system-mode/changes',{mode:'MAINTENANCE',reason:'Synthetic browser interrupted upload',expectedVersion:mode.policyVersion??mode.version,titleZh:'合成维护验收',titleEn:'Synthetic maintenance',bodyZh:'保留原申请和文件',bodyEn:'Retain original application and files',estimatedRecoveryAt:new Date(Date.now()+600000).toISOString()});maintenanceVersion=current.policyVersion??current.version;
   }
   await route.continue();
  });
 }
 const submitted=page.waitForResponse(response=>response.request().method()==='POST'&&/\/exemption-applications\/[^/]+\/submit$/.test(response.url()),{timeout:90000});
 submitted.catch(()=>{});
 await page.locator('[data-action="exemption.submit"]').click();
 await page.waitForFunction(()=>window.uploadLabels.some(text=>/上传.*\b(?:[1-9]|[1-9]\d)%/.test(text)),{},{timeout:60000});
 await page.screenshot({path:`evidence/demand-20260916/browser/${evidencePrefix}-progress.png`,fullPage:true});
 if(maintenanceTest){
  try { await page.getByText('合成维护验收',{exact:true}).waitFor({timeout:45000}); }
  catch(error){console.log((await page.locator('body').innerText()).slice(-2600));await page.screenshot({path:'evidence/demand-20260916/browser/maintenance-failure.png',fullPage:true});throw error;}
  await page.screenshot({path:'evidence/demand-20260916/browser/maintenance-upload-blocked.png',fullPage:true});
  const current=await adminRequest('/system-mode');
  await adminRequest('/system-mode/changes',{mode:'NORMAL',reason:'Synthetic browser recovery',expectedVersion:current.policyVersion??current.version??maintenanceVersion});
  await page.locator('[data-action="exemption.submit"]').waitFor({timeout:45000});
  assert.equal(await page.locator('#exemption-reason').inputValue(),'Synthetic browser upload acceptance');
  await page.locator('[data-action="exemption.submit"]').click();
 }
 const response=await submitted;assert.equal(response.status(),200,await response.text());
 const labels=await page.evaluate(()=>window.uploadLabels);
 assert.deepEqual(uploadResponses,[200,200]);
 await page.waitForTimeout(500);
 await page.screenshot({path:`evidence/demand-20260916/browser/${evidencePrefix}-submitted.png`,fullPage:true});
 await fs.writeFile(`evidence/demand-20260916/browser/${evidencePrefix}-result.json`,JSON.stringify({requirement:maintenanceTest?20:17,maintenanceRecovery:maintenanceTest,files:['PDF','PNG'],realMinioPuts:uploadResponses,submitStatus:response.status(),labels},null,2));
}finally{
 await browser.close();
 if(maintenanceTest){const current=await adminRequest('/system-mode');if(current.mode==='MAINTENANCE')await adminRequest('/system-mode/changes',{mode:'NORMAL',reason:'Synthetic browser test cleanup',expectedVersion:current.policyVersion});}
}
