import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const file='.local/membership-20260913-private.json',f=JSON.parse(fs.readFileSync(file));const base='https://www.student.bnbusports.cn/api/v1';
const save=()=>fs.writeFileSync(file,JSON.stringify(f));const pass=check=>console.log(JSON.stringify({check,result:'PASS'}));
const rows=d=>Array.isArray(d)?d:d.items;
async function api(path,token,body,method=body?'POST':'GET',key=randomUUID()){const r=await fetch(base+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json','idempotency-key':key},...(body?{body:JSON.stringify(body)}:{})});const value=await r.json();return{status:r.status,data:value.data,code:value.code};}
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});let page;
try{
 const rulePath=`/class-sections/${f.fixture.teacherAActiveSectionId}/v81-rules`,r=(await api(rulePath,f.teacherToken)).data;
 if(!f.exercise){
  assert.equal((await api(rulePath,f.teacherToken,{templateId:r.template_id,minimumMinutes:1,maximumMinutes:1,weeklyLimit:3,dailyLimit:3,courseTarget:r.course_target,generalTarget:r.general_target,regularDeadline:r.regular_deadline,closingDeadline:r.closing_deadline,settlementPlannedAt:r.settlement_planned_at,publish:true,expectedVersion:r.version,globalTargetVersion:r.global_target_version})).status,201);
  const started=await api('/exercise-sessions',f.studentSession.accessToken,{enrollmentId:f.student.enrollmentId,clientObservedAt:new Date().toISOString()});assert.equal(started.status,201,started.code);f.exercise=started.data;f.started=Date.now();save();
 }
 page=await browser.newPage({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai'});page.setDefaultTimeout(45000);
 await page.addInitScript(auth=>{localStorage.setItem('bnbu.student.web.apiTokens',JSON.stringify(auth));localStorage.setItem('bnbu.student.web.session',JSON.stringify({kind:'api',accountId:auth.accountId,signedInAt:new Date().toISOString()}));},{...f.studentSession,userId:f.student.userId,accountId:'SYNTH-SESSION-'+f.student.email.split('.')[2].toUpperCase(),schemaVersion:2});
 await page.goto('https://www.student.bnbusports.cn/student/');await page.getByRole('button',{name:'同意并继续',exact:true}).click();
 const settled=async()=>{for(let i=0;i<150;i++){if(await page.evaluate(async()=>{const{app}=await import('/student/js/app.js');return app.state.authenticated&&!app.state.isLoading&&!app.state.isRestoringSession&&!app.ui.exemption?.submitting;}))return;await page.waitForTimeout(200);}throw Error('Workspace did not load');};await settled();
 if(await page.getByRole('button',{name:'跳过',exact:true}).isVisible())await page.getByRole('button',{name:'跳过',exact:true}).click();
 f.applicationIds??=[];
 for(const type of ['1000m','team','club']){
  if(f.applicationIds.some(a=>a.type===type))continue;
  await page.locator('[data-action="root.tab"][data-tab="profile"]').click();await page.locator('[data-action="profile.openExemption"]').click();await page.locator('[data-action="exemption.tab"][data-value="new"]').click();await page.locator(`[data-action="exemption.selectType"][data-value="${type}"]`).click();
  if(type!=='1000m')await page.locator('#exemption-organization').fill('Synthetic MEMBER13 organization');await page.locator('#exemption-reason').fill('Synthetic MEMBER13 '+type+' lifecycle acceptance');
  await page.locator('[data-exemption-input="camera"]').setInputFiles('.local/v81-browser-state/demand-photo.jpg');
  await page.waitForFunction(()=>{const image=document.querySelector('.exemption-proof-preview img');return image?.complete&&image.naturalWidth>0;});
  await page.screenshot({path:'.local/membership-cloud-cover-'+type+'.png'});await page.locator('.exemption-proof-preview').first().click();await page.locator('.material-preview img').waitFor();await page.locator('.material-preview').getByRole('button',{name:'关闭',exact:true}).click();
  if(type==='team')await page.evaluate(async()=>{const{app}=await import('/student/js/app.js');for(const course of app.state.workspace.courses)course.isCurrent=false;app.ui.exemption.serverDraft={id:'stale-draft-not-to-send',enrollmentId:'old-membership',version:1,mediaIds:['old-proof']};});
  const response=page.waitForResponse(x=>/\/exemption-applications\/[^/]+\/submit$/.test(new URL(x.url()).pathname)&&x.request().method()==='POST');response.catch(()=>{});
  await page.locator('[data-action="exemption.submit"]').click();const submitted=await response;assert.equal(submitted.status(),200);const a=(await submitted.json()).data;f.applicationIds.push({id:a.id,type,mediaIds:a.mediaIds});save();await settled();
  if(type!=='club')assert.equal((await api('/exemption-applications/'+a.id+'/review',f.teacherToken,{decision:'APPROVE',publicComment:'Synthetic approved '+type,expectedVersion:a.version,...(type==='team'?{courseMinutes:15,generalMinutes:15}:{})})).status,200);
  await page.reload();await settled();
  await page.locator('[data-action="root.tab"][data-tab="profile"]').click();await page.locator('[data-action="profile.openExemption"]').click();await page.locator(`[data-action="exemption.open"][data-exemption-id="${a.id}"]`).click();
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-exemption-proof-thumbnail] img')].some(i=>i.complete&&i.naturalWidth>0));await page.locator('[data-exemption-proof-thumbnail]').first().click();await page.locator('.material-preview img').waitFor();await page.locator('.material-preview').getByRole('button',{name:'关闭',exact:true}).click();
  await page.screenshot({path:'.local/membership-cloud-detail-'+type+'.png'});await page.reload();await settled();pass('CLOUD_APPLICATION_'+type+'_REAL_COS_COVER_PREVIEW_SUBMISSION');
 }
 while(Date.now()-f.started<61000)await page.waitForTimeout(1000);
 if(!f.record){
  const done=await api('/exercise-sessions/'+f.exercise.id,f.studentSession.accessToken);assert.equal(done.data.status,'COMPLETED');assert.equal(done.data.actualDurationSeconds,60);
  const created=await api('/exercise-records',f.studentSession.accessToken,{sessionId:f.exercise.id,creditType:'GENERAL',sportType:'RUNNING',description:'Synthetic MEMBER13 record scope',clientRequestId:randomUUID()});assert.equal(created.status,201);f.record=created.data;save();
  const bytes=fs.readFileSync('.local/v81-browser-state/demand-photo.jpg');const upload=await api('/media-uploads',f.studentSession.accessToken,{sessionId:f.exercise.id,businessPurpose:'EXERCISE_RECORD',mediaType:'IMAGE',mimeType:'image/jpeg',fileSizeBytes:bytes.length,declaredContentSha256:createHash('sha256').update(bytes).digest('hex'),durationSeconds:null,captureSource:'IN_APP_CAMERA'});assert.equal(upload.status,201);
  const put=await fetch(upload.data.uploadUrl,{method:'PUT',headers:upload.data.requiredHeaders,body:bytes});assert.equal(put.status,200);
  const confirmed=await api('/media-uploads/'+upload.data.uploadSessionId+'/confirm',f.studentSession.accessToken,{etag:put.headers.get('etag').replaceAll('"','')});assert.equal(confirmed.status,200);
  assert.equal((await api('/media/'+upload.data.mediaId+'/bind',f.studentSession.accessToken,{sessionId:f.exercise.id,expectedVersion:confirmed.data.version})).status,200);
  for(let i=0;i<60;i++){const m=await api('/media/'+upload.data.mediaId,f.studentSession.accessToken);if(m.data.uploadStatus==='AVAILABLE')break;await page.waitForTimeout(500);}
  assert.equal((await api('/exercise-records/'+f.record.id+'/submit',f.studentSession.accessToken,{expectedVersion:f.record.version,mediaIds:[upload.data.mediaId]})).status,200);
 }
 assert.ok(rows((await api('/exercise-records?limit=100',f.teacherToken)).data).some(r=>r.id===f.record.id));
 const enrollment=rows((await api('/enrollments?limit=100',f.teacherToken)).data).find(e=>e.id===f.student.enrollmentId);assert.ok(enrollment);
 const key=randomUUID(),body={reason:'Synthetic MEMBER13 confirmed application cleanup',expectedVersion:enrollment.version};
 const removed=await api('/enrollments/'+enrollment.id+'/remove',f.teacherToken,body,'POST',key);assert.equal(removed.status,200,removed.code);assert.deepEqual((await api('/enrollments/'+enrollment.id+'/remove',f.teacherToken,body,'POST',key)).data,removed.data);
 for(const token of [f.teacherToken,f.studentSession.accessToken]){const apps=rows((await api('/exemption-applications?limit=100',token)).data);assert.ok(!apps.some(a=>f.applicationIds.some(x=>x.id===a.id)));for(const a of f.applicationIds)assert.equal((await api('/exemption-applications/'+a.id,token)).status,404);}
 assert.ok(!rows((await api('/exercise-records?limit=100',f.teacherToken)).data).some(r=>r.id===f.record.id));assert.equal((await api('/exercise-records/'+f.record.id,f.studentSession.accessToken)).status,200);
 await page.reload();await settled();await page.locator('[data-action="root.tab"][data-tab="profile"]').click();await page.locator('[data-action="profile.openExemption"]').click();assert.equal(await page.locator('[data-action="exemption.open"]').count(),0);await page.screenshot({path:'.local/membership-cloud-cleared.png'});
 assert.equal((await api('/enrollments/'+enrollment.id+'/restore',f.teacherToken,{reason:'Synthetic restore without qualification revival',expectedVersion:removed.data.version})).status,200);
 assert.equal(rows((await api('/exemption-applications?limit=100',f.studentSession.accessToken)).data).length,0);
 const progress=rows((await api('/student-progress?limit=100',f.studentSession.accessToken)).data).find(p=>p.enrollmentId===enrollment.id);assert.equal(progress.courseRelated.recognizedSeconds,0);assert.equal(progress.general.recognizedSeconds,0);
 pass('CLOUD_REMOVAL_IDEMPOTENT_APPLICATION_CLEAR_RECORD_SCOPE_HISTORY_AND_RESTORE');
}catch(error){console.error(error);await page?.screenshot({path:'.local/membership-cloud-failure.png'});process.exitCode=1;}finally{await browser.close();}
