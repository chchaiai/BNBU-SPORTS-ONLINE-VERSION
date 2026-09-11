import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const fixture=JSON.parse(fs.readFileSync('.local/round2-cloud-long-private.json','utf8'));
const submission=JSON.parse(fs.readFileSync('.local/round2-cloud-long-submission.json','utf8'));
const comment='腾讯云完整打卡验收：已核对现场照片和视频，运动记录有效，计入通识运动学时。';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let stage='TEACHER_LOGIN',page;
try{
 page=await browser.newPage();page.setDefaultTimeout(60000);await page.goto('https://www.teacher.bnbusports.cn/');
 await page.locator('#login-account').fill(fixture.teacher.email);await page.locator('#login-password').fill(fixture.teacher.password);
 const loginResponse=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/auth/password-login')&&r.request().method()==='POST');await page.getByRole('button',{name:'登录',exact:true}).click();const login=await loginResponse;assert.equal(login.status(),200);const token=(await login.json()).data.accessToken;
 const read=async path=>{const r=await page.request.get('https://www.teacher.bnbusports.cn/api/v1'+path,{headers:{authorization:`Bearer ${token}`}});assert.equal(r.status(),200);return(await r.json()).data;};
 const student=await read('/students/'+fixture.student.studentId);
 await page.getByRole('button',{name:/新建课程/}).waitFor();stage='REVIEW_QUEUE';await page.getByRole('button',{name:'打卡审核',exact:true}).click();await page.getByRole('tab',{name:/全部记录/}).click();
 await page.getByRole('row').filter({hasText:student.fullName}).getByRole('button',{name:/查看记录/}).click();const row=page.locator('#checkin-record-'+submission.recordId);await row.waitFor();
 const evidence=await read(`/exercise-records/${submission.recordId}/evidence-context`);assert.equal(evidence.mediaIds.length,2);
 for(const mediaId of evidence.mediaIds){const media=await read('/media/'+mediaId);assert.equal(media.uploadStatus,'AVAILABLE');}
 stage='TEACHER_ORIGINAL_MEDIA';await row.locator('.checkin-description').click();const mediaDialog=page.getByRole('dialog');const tabs=mediaDialog.getByRole('tablist',{name:'选择要审核的凭证'}).getByRole('tab');assert.equal(await tabs.count(),2);const observed=[];
 for(let index=0;index<2;index++){
  await tabs.nth(index).click();await page.waitForFunction(()=>!!document.querySelector('.teacher-original-media img,.teacher-original-media video'));
  const container=mediaDialog.locator('.teacher-original-media'),mediaId=await container.getAttribute('data-media-id'),metadata=await read('/media/'+mediaId);
  if(metadata.mediaType==='IMAGE')await page.waitForFunction(()=>{const image=document.querySelector('.teacher-original-media img');return image?.complete&&image.naturalWidth>0;});
  else{assert.equal(metadata.mediaType,'VIDEO');const video=container.locator('video');await video.evaluate(async el=>{el.muted=true;await el.play();});await page.waitForFunction(()=>{const video=document.querySelector('.teacher-original-media video');return video?.currentTime>1&&video.videoWidth>0&&!video.error;});await video.evaluate(el=>el.pause());}
  await mediaDialog.screenshot({path:`.local/round2-evidence/cloud-long-teacher-${metadata.mediaType.toLowerCase()}.png`});observed.push({mediaId,type:metadata.mediaType});
 }
 assert.deepEqual(observed.map(item=>item.mediaId).sort(),[...evidence.mediaIds].sort());await mediaDialog.getByRole('button',{name:'关闭',exact:true}).click();
 console.log(JSON.stringify({check:'CLOUD_TEACHER_ORIGINAL_PHOTO_VIDEO_PLAYBACK',result:'PASS',observed}));
 await page.screenshot({path:'.local/round2-evidence/cloud-long-teacher-evidence.png',fullPage:true});
 stage='PUBLIC_COMMENT';const before=await read(`/exercise-records/${submission.recordId}/workflow`);
 if(before.stage!=='VALID'){await row.getByRole('radio',{name:'通过',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.locator('textarea').fill(comment);
 const reviewResponse=page.waitForResponse(r=>new URL(r.url()).pathname.includes(submission.recordId)&&r.request().method()==='POST');await dialog.getByRole('button',{name:'确认通过',exact:true}).click();assert.ok((await reviewResponse).ok());}
 else assert.equal(before.publicComment,comment,'A retry may only read this acceptance review');
 const workflow=await read(`/exercise-records/${submission.recordId}/workflow`);assert.equal(workflow.stage,'VALID');assert.equal(workflow.publicComment,comment);
 const record=await read('/exercise-records/'+submission.recordId);assert.ok(record.creditedDurationSeconds>=1800);await page.reload();
 console.log(JSON.stringify({check:'CLOUD_TEACHER_BROWSER_PUBLIC_REVIEW',result:'PASS',recordId:submission.recordId,creditedDurationSeconds:record.creditedDurationSeconds,mediaCount:evidence.mediaIds.length}));
 stage='STUDENT_FEEDBACK';const context=await browser.newContext({storageState:'.local/round2-cloud-student-storage.json'});const studentPage=await context.newPage();page=studentPage;studentPage.setDefaultTimeout(60000);await studentPage.goto('https://www.student.bnbusports.cn/student/');await studentPage.getByText('我的',{exact:true}).waitFor();
 const data=await studentPage.evaluate(async recordId=>{const api=await import('/student/js/api.js');const records=await api.listMyRecords();return records.find(r=>r.id===recordId);},submission.recordId);
 assert.ok(data);
 await studentPage.locator('[data-action="root.tab"][data-tab="checkin"]').click();
 await studentPage.locator('[data-action="checkin.tab"][data-tab="records"]').click();
 const studentRecord=studentPage.locator(`[data-action="checkin.openRecord"][data-record-id="${submission.recordId}"]`);await studentRecord.waitFor();
 const recordText=await studentRecord.innerText();assert.ok(recordText.includes('有效 · 已计入'));assert.ok(recordText.includes('0.5h'));
 await studentRecord.click();
 await studentPage.getByText(comment,{exact:true}).waitFor();
 await studentPage.screenshot({path:'.local/round2-evidence/cloud-long-student-feedback.png',fullPage:true});
 await studentPage.reload();await studentPage.getByText('我的',{exact:true}).waitFor();
 const progress=await studentPage.evaluate(async enrollmentId=>{const api=await import('/student/js/api.js');return(await api.listMyStudentProgress()).find(p=>p.enrollmentId===enrollmentId);},fixture.student.enrollmentId);
 assert.ok(progress);assert.equal(progress.general.effectiveSeconds,record.creditedDurationSeconds);assert.equal(progress.courseRelated.effectiveSeconds,0);
 await studentPage.locator('[data-action="root.tab"][data-tab="grades"]').click();
 await studentPage.getByText('查看已计入的运动时长和教师确认的体测用时。',{exact:true}).waitFor();await studentPage.locator('.tab-content').getByText('30 分钟',{exact:true}).first().waitFor();await studentPage.screenshot({path:'.local/round2-evidence/cloud-long-student-progress.png',fullPage:true});const progressText=await studentPage.locator('.tab-content').innerText();console.log(JSON.stringify({check:'CLOUD_STUDENT_PROGRESS_VISIBLE',text:progressText}));assert.ok(progressText.includes('30 分钟'));assert.match(progressText,/其他运动\s+30 分钟/);assert.match(progressText,/课程相关\s+0 分钟/);
 await studentPage.locator('[data-action="root.tab"][data-tab="dashboard"]').click();await studentPage.locator('[data-action="dashboard.openNotifications"]').click();
 const notice=studentPage.locator('.notice-row').filter({hasText:comment});await notice.waitFor();
 const noticeId=await notice.getAttribute('data-notice-id');const beforeNotice=await studentPage.evaluate(async id=>{const api=await import('/student/js/api.js');return(await api.listMyNotifications()).find(n=>n.id===id);},noticeId);assert.equal(beforeNotice.body,comment);
 if(beforeNotice.readAt===null){const readResponse=studentPage.waitForResponse(r=>new URL(r.url()).pathname===`/api/v1/notifications/${noticeId}/read`&&r.request().method()==='POST');await notice.click();assert.equal((await readResponse).status(),200);}else await notice.click();
 console.log(JSON.stringify({check:'CLOUD_STUDENT_PROGRESS_AND_NOTIFICATION_READ',result:'PASS',generalEffectiveSeconds:progress.general.effectiveSeconds,courseEffectiveSeconds:progress.courseRelated.effectiveSeconds,notificationRead:true}));
 console.log(JSON.stringify({check:'CLOUD_STUDENT_BROWSER_FEEDBACK_AND_CREDIT',result:'PASS',recordId:submission.recordId,creditedDurationSeconds:record.creditedDurationSeconds,publicCommentMatched:true}));
}catch(error){console.error(JSON.stringify({check:'CLOUD_LONG_REVIEW',result:'FAIL',stage,type:error.name,message:error.message.slice(0,1000)}));if(page)await page.screenshot({path:'.local/round2-evidence/cloud-long-review-failure.png',fullPage:true});process.exitCode=1;}finally{await browser.close();}
