import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const f=JSON.parse(await fs.readFile('.local/demand-six-private.json','utf8'));
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1050}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://www.teacher.bnbusports.cn/');
 await page.locator('#login-account').fill(f.accounts.teacher.email);await page.locator('#login-password').fill(f.accounts.teacher.password);
 await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.getByRole('button',{name:'通知',exact:true}).waitFor();
 await page.getByRole('button',{name:'打卡审核',exact:true}).click();
 await page.getByRole('button',{name:'查看记录 →',exact:true}).click();
 await page.locator('.ai-review-panel').first().waitFor();
 await page.locator('.record-proof-links button').first().click();
 await page.waitForFunction(()=>{const img=document.querySelector('.teacher-original-media img');return img&&img.naturalWidth>0;});
 assert.equal(await page.locator('dl[aria-label="照片拍摄信息"]').count(),0);
 await page.screenshot({path:'evidence/demand-1-6-20260917/cloud-teacher.png',fullPage:true});
 await page.getByRole('button',{name:'完成查看',exact:true}).click();
 await page.getByRole('button',{name:'课程管理',exact:true}).click();
 await page.locator('.teacher-course-card').filter({hasText:'Synthetic Teacher A Active Section'}).getByRole('button',{name:'邀请二维码',exact:true}).click();
 if(await page.getByRole('button',{name:'撤销邀请码',exact:true}).isVisible()){
  await page.getByRole('button',{name:'撤销邀请码',exact:true}).click();await page.getByRole('button',{name:'确认撤销',exact:true}).click();
  await page.getByRole('button',{name:'确认撤销',exact:true}).waitFor({state:'hidden'});
  await page.locator('.teacher-course-card').filter({hasText:'Synthetic Teacher A Active Section'}).getByRole('button',{name:'邀请二维码',exact:true}).click();
 }
 await page.getByRole('button',{name:'生成新邀请码',exact:true}).click();
 await page.locator('.course-invite-print-sheet img').waitFor();
 await page.addScriptTag({path:'BNBU-Sports-Web-new/frontend/student/js/vendor/jsQR.js'});
 const qrUrl=await page.evaluate(()=>{const img=document.querySelector('.course-invite-print-sheet img');const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const d=ctx.getImageData(0,0,c.width,c.height);return window.jsQR(d.data,d.width,d.height)?.data;});
 const url=new URL(qrUrl);assert.equal(url.origin,'https://www.student.bnbusports.cn');assert.equal(url.pathname,'/student/');assert.ok(url.searchParams.get('invite'));
 const student=await browser.newPage({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36',isMobile:true,hasTouch:true});
 student.on('pageerror',e=>errors.push(e.message));
 await fs.writeFile('.local/demand-six-qr-url.txt',qrUrl);
 await student.goto(qrUrl);await student.screenshot({path:'.local/demand-six-qr-debug.png'});

 await student.locator('[data-action="consent.agree"]').click();
 await student.getByText('验证学校邮箱',{exact:true}).waitFor();
 await student.screenshot({path:'evidence/demand-1-6-20260917/cloud-qr-join.png'});
 await page.getByRole('button',{name:'撤销邀请码',exact:true}).click();
 await page.getByRole('button',{name:'确认撤销',exact:true}).click();
 await page.getByRole('button',{name:'确认撤销',exact:true}).waitFor({state:'hidden'});
 const result={result:'PASS',mediaLoaded:true,photoParametersHidden:true,actualQrDecoded:true,officialStudentUrl:true,schoolEmailFlow:true,testInviteRevoked:true,pageErrors:errors};
 await fs.writeFile('evidence/demand-1-6-20260917/cloud-browser.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 await page.context().storageState({path:'.local/demand-six-browser-session.json'});
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
