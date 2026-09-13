import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const cloud=process.env.BNBU_PREVIEW_CLOUD==='1',label=cloud?'cloud':'local';
const f=JSON.parse(fs.readFileSync(cloud?'.local/round2-cloud-long-private.json':'.local/v81-browser-state/state.json'));
const teacher=cloud?f.teacher:f.accounts.teacher,origin=cloud?'https://www.teacher.bnbusports.cn':'http://localhost:3300';
const{recordId}=JSON.parse(fs.readFileSync(cloud?'.local/round2-cloud-long-submission.json':'.local/v81-browser-state/camera-submission-round2-positive-credit.json'));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const samples=[];
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('requestfinished', r=>{const u=new URL(r.url());if(u.pathname.includes('/media/')||u.hostname.includes('myqcloud')){const t=r.timing();samples.push({kind:u.origin!==origin?'object':u.pathname.includes('/access-url')?'access':'metadata',ms:Math.round(t.responseEnd),method:r.method()});}});page.setDefaultTimeout(60000);await page.goto(origin);
 await page.locator('#login-account').fill(teacher.email);await page.locator('#login-password').fill(teacher.password);
 const logged=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/auth/password-login'));await page.getByRole('button',{name:'登录',exact:true}).click();const response=await logged;assert.equal(response.status(),200);const token=(await response.json()).data.accessToken;
 const get=async path=>{const r=await page.request.get(origin+'/api/v1'+path,{headers:{authorization:`Bearer ${token}`}});assert.equal(r.status(),200);return(await r.json()).data;};
 const record=await get('/exercise-records/'+recordId),student=await get('/students/'+record.studentId);
 await page.getByRole('button',{name:/新建课程/}).waitFor();await page.getByRole('button',{name:'打卡审核',exact:true}).click();await page.getByRole('tab',{name:/全部记录/}).click();await page.getByRole('row').filter({hasText:student.fullName}).getByRole('button',{name:/查看记录/}).click();
 const row=page.locator('#checkin-record-'+recordId);await row.scrollIntoViewIfNeeded();
 const loaded=async target=>{await target.locator('.teacher-media-thumbnail img').first().waitFor();await page.waitForFunction(id=>{const el=document.querySelector('#checkin-record-'+id);return [...el.querySelectorAll('.teacher-media-thumbnail img')].some(i=>i.naturalWidth>0)&&[...el.querySelectorAll('.teacher-media-thumbnail video')].some(v=>v.readyState>=2&&v.videoWidth>0);},recordId);};
 await loaded(row);console.log(JSON.stringify({phase:'list',samples:samples.splice(0)}));await row.screenshot({path:'.local/teacher-previews-'+label+'-list.png'});
 await page.getByRole('button',{name:'相册',exact:true}).click();await row.scrollIntoViewIfNeeded();await loaded(row);if(process.env.BNBU_MEDIA_EXPECT_REUSE==='1')assert.equal(samples.filter(x=>x.kind!=='object').length,0);console.log(JSON.stringify({phase:'album',samples:samples.splice(0)}));assert.equal(await row.locator('.proof-thumbnail-real').first().evaluate(e=>getComputedStyle(e,'::before').content),'none');await row.screenshot({path:'.local/teacher-previews-'+label+'-album.png'});
 if(process.env.BNBU_MEDIA_EXPECT_REUSE==='1'){
  samples.length=0;await row.getByRole('button',{name:/查看完整记录/}).click();
  await page.getByRole('tab',{name:/凭证 2/}).click();
  const playback=page.locator('.teacher-original-media video');await playback.waitFor();
  assert.equal(await playback.getAttribute('preload'),'auto');
  await playback.evaluate(v=>v.play());await page.waitForFunction(()=>document.querySelector('.teacher-original-media video')?.currentTime>0);
  assert.equal(samples.filter(x=>x.kind!=='object').length,0);console.log(JSON.stringify({phase:'detail-playback',samples:samples.splice(0),playing:true}));
  await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
 }
 await page.getByRole('button',{name:'内部成绩册',exact:true}).click();assert.equal(await page.getByRole('button',{name:'向学生披露换算分、等级或排名',exact:true}).count(),0);
 await page.getByRole('button',{name:'免测与认证',exact:true}).click();await page.getByRole('tab',{name:/全部申请/}).click();
 const material=page.locator('.material-thumb').filter({has:page.locator('[data-thumbnail-media-id]')}).first();await material.waitFor();await material.scrollIntoViewIfNeeded();await material.click();
 const application=page.getByRole('dialog');await application.locator('.evidence-thumbnail-real img').first().waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('.evidence-thumbnail-real img')].some(i=>i.naturalWidth>0));assert.equal(await application.locator('.evidence-thumbnail-real').first().evaluate(e=>getComputedStyle(e,'::before').content),'none');await application.screenshot({path:'.local/teacher-previews-'+label+'-application.png'});
 await application.getByRole('button',{name:'关闭',exact:true}).click();
 await page.getByRole('button',{name:'通知',exact:true}).click();const notices=page.getByRole('dialog',{name:'我的通知'});await notices.locator('.portal-notifications[aria-busy="false"]').waitFor();
 assert.ok((await notices.boundingBox()).width>=600);await notices.screenshot({path:'.local/teacher-previews-'+label+'-notifications.png'});
 await notices.getByRole('button',{name:'未读通知',exact:true}).click();await notices.locator('.portal-notifications[aria-busy="false"]').waitFor();assert.equal(await notices.getByRole('button',{name:'未读通知',exact:true}).getAttribute('aria-pressed'),'true');
 await page.setViewportSize({width:390,height:844});await notices.screenshot({path:'.local/teacher-previews-'+label+'-notifications-mobile.png'});assert.ok((await notices.boundingBox()).width<=390);
 console.log(JSON.stringify({check:'TEACHER_REAL_MEDIA_AND_NOTIFICATION_UI',environment:label,result:'PASS',listImageAndVideoDecoded:true,albumImageAndVideoDecoded:true,applicationImageDecoded:true,decorativePatternsRemoved:true,gradeDisclosureButtonRemoved:true,notificationFilterAndResponsiveLayout:true}));
}catch(e){console.error(e);throw e;}finally{await browser.close();}
