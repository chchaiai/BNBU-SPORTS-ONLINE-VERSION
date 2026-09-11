import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(fs.readFileSync(new URL('../../.local/v81-browser-state/state.json',import.meta.url)));
const submissionPath=new URL(`../../.local/v81-browser-state/camera-submission${process.env.V81_STUDENT_PURPOSE?'-'+process.env.V81_STUDENT_PURPOSE:''}.json`,import.meta.url);
if(process.env.V81_STUDENT_PURPOSE){
  if(!['supplement','supplement-once','positive-credit','round2-positive-credit','round2-submit-retry','maintenance-supplement'].includes(process.env.V81_STUDENT_PURPOSE))throw new Error('Unsupported synthetic fixture purpose');
  const student=JSON.parse(fs.readFileSync(new URL(`../../.local/v81-browser-state/student-${process.env.V81_STUDENT_PURPOSE}.json`,import.meta.url)));
  state.accounts.student={email:student.email};
}
const cameraProbe=process.env.V81_STUDENT_CAMERA==='1';
const realMinutes=Number(process.env.V81_REAL_MINUTES??0);
const resumeExisting=process.env.V81_RESUME_EXISTING_CAMERA==='1';
if(resumeExisting&&!['positive-credit','round2-positive-credit'].includes(process.env.V81_STUDENT_PURPOSE))throw new Error('Recovery requires the dedicated positive-credit fixture');
if(![0,30,45,60].includes(realMinutes)||(realMinutes>0&&!['positive-credit','round2-positive-credit'].includes(process.env.V81_STUDENT_PURPOSE)))throw new Error('Real elapsed test requires dedicated positive-credit fixture and a supported threshold');
const supplementProbe=process.env.V81_STUDENT_SUPPLEMENT==='1';
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,
  ...(cameraProbe||supplementProbe?{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']}: {})});
let stage='PRIVACY';
let diagnosticPage,ownedSession;const apiResponses=[];
try {
  const page=await browser.newPage();
  if(process.env.V81_STALE_WINDOW==='1')await page.route('**/api/v1/class-sections*',async route=>{
    const response=await route.fetch(),body=await response.json();
    const rows=Array.isArray(body.data)?body.data:body.data?.items;
    assert.ok(Array.isArray(rows));
    for(const row of rows){row.checkInStartDate='2000-01-01';row.checkInEndDate='2000-01-02';row.submissionDeadlineAt='2000-01-03T00:00:00.000Z';}
    await route.fulfill({response,json:body});
  });
  diagnosticPage=page;
  page.on('response',response=>{const path=new URL(response.url()).pathname;if(path.startsWith('/api/v1/'))apiResponses.push({path,status:response.status()});});
  await page.goto('http://127.0.0.1:4274/student/');
  await page.getByRole('button',{name:'同意并继续'}).click();
  await page.getByText('直接登录',{exact:true}).click();
  await page.getByText('邮箱验证码登录',{exact:true}).click();
  await page.getByPlaceholder('name@bnbu.edu.cn').fill(state.accounts.student.email);
  stage='SEND_CODE';
  const existingMessages=await(await fetch('http://127.0.0.1:18025/api/v1/messages?limit=50')).json();
  const existingIds=new Set((existingMessages.messages??[]).map(item=>item.ID));
  await page.getByRole('button',{name:'获取验证码',exact:true}).click();
  let code;
  for(let attempt=0;attempt<30&&!code;attempt++){
    const messages=await(await fetch('http://127.0.0.1:18025/api/v1/messages?limit=50')).json();
    const message=messages.messages?.find(item=>!existingIds.has(item.ID)&&JSON.stringify(item.To??[]).includes(state.accounts.student.email));
    if(message){const mail=await(await fetch(`http://127.0.0.1:18025/api/v1/message/${message.ID}`)).json();code=(mail.Text??'').match(/\b\d{6}\b/)?.[0];}
    if(!code)await new Promise(resolve=>setTimeout(resolve,500));
  }
  assert.ok(code);
  stage='VERIFY_LOGIN';
  await page.getByPlaceholder('4–10 位数字').fill(code);
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.getByText('我的',{exact:true}).waitFor();
  console.log(JSON.stringify({check:'STUDENT_BROWSER_SMTP_LOGIN',result:'PASS'}));
  // Synthetic fixture view only; omit all account identifiers from diagnostics.
  const text=await page.locator('body').innerText();
  console.log(JSON.stringify({check:'STUDENT_HOME_CONTENT',hasCourse:text.includes('课程'),hasProgress:text.includes('进度'),hasLoginForm:await page.getByPlaceholder('4–10 位数字').count()>0}));
  stage='RELOAD';
  const courseRulesResponse=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/v81-rules')&&response.status()===200);
  await page.reload();
  await page.getByText('运动指引',{exact:true}).waitFor();
  await page.getByRole('button',{name:'跳过',exact:true}).click();
  await page.getByText('我的',{exact:true}).waitFor();
  assert.equal(await page.getByPlaceholder('4–10 位数字').count(),0);
  assert.ok(apiResponses.some(item=>item.path==='/api/v1/me'&&item.status===200));
  const courseRules=(await (await courseRulesResponse).json()).data;
  assert.ok([30,45,60].includes(courseRules.minimum_minutes));
  assert.ok(!apiResponses.some(item=>item.path==='/api/v1/student/course'));
  console.log(JSON.stringify({check:'STUDENT_BROWSER_SESSION_RELOAD',result:'PASS',apiResponses}));
  if(process.env.V81_CREATE_FEEDBACK==='1'){
    stage='CREATE_FEEDBACK';
    const content=`Synthetic browser feedback workflow ${crypto.randomUUID()}`;
    await page.locator('[data-action="root.tab"][data-tab="profile"]').click();
    stage='CREATE_FEEDBACK_OPEN';
    await page.locator('[data-action="profile.openSettings"]').click();
    await page.locator('[data-action="profile.openFeedback"]').click();
    stage='CREATE_FEEDBACK_FILL';
    await page.locator('[data-input="feedback.description"]').fill(content);
    stage='CREATE_FEEDBACK_SUBMIT';
    const submitted=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/v1/feedback'&&response.request().method()==='POST');
    await page.locator('[data-action="feedback.submit"]').click();
    const response=await submitted;
    assert.equal(response.status(),201);
    const {id}= (await response.json()).data;
    fs.writeFileSync(new URL('../../.local/v81-browser-state/feedback-submission.json',import.meta.url),JSON.stringify({id,content}));
    console.log(JSON.stringify({check:'STUDENT_BROWSER_FEEDBACK_SUBMISSION',result:'PASS'}));
  }
  if(process.env.V81_READ_FEEDBACK==='1'){
    stage='READ_FEEDBACK';
    const {id,content}=JSON.parse(fs.readFileSync(new URL('../../.local/v81-browser-state/feedback-submission.json',import.meta.url)));
    const headers={authorization:(await (await courseRulesResponse).request().allHeaders()).authorization};
    const response=await page.request.get(`http://127.0.0.1:4274/api/v1/feedback/${id}`,{headers});
    assert.equal(response.status(),200);const result=(await response.json()).data;
    assert.equal(result.status,'IN_PROGRESS');assert.equal(result.publicReply,'Synthetic public reply from admin browser');
    await page.locator('[data-action="root.tab"][data-tab="profile"]').click();
    await page.locator('[data-action="profile.openSettings"]').click();
    await page.locator('[data-action="profile.openFeedback"]').click();
    await page.locator('[data-action="feedback.tab"][data-value="tickets"]').click();
    await page.locator('.swiss-panel').filter({hasText:content??result.content}).getByText(/Synthetic public reply from admin browser/).first().waitFor();
    console.log(JSON.stringify({check:'STUDENT_READS_ADMIN_BROWSER_FEEDBACK_REPLY',result:'PASS'}));
  }
  if(supplementProbe){
    stage='SUPPLEMENT_CAPTURE';
    await page.locator('[data-action="root.tab"][data-tab="checkin"]').click();
    await page.getByRole('button',{name:'拍摄补证',exact:true}).click();
    await page.locator('[data-action="checkin.cameraTakePhoto"]').click();
    const submit=page.getByRole('button',{name:'提交补证',exact:true});await submit.waitFor();
    stage='SUPPLEMENT_SUBMIT';
    const responsePromise=page.waitForResponse(response=>/\/exercise-records\/[^/]+\/supplements$/.test(new URL(response.url()).pathname)&&response.request().method()==='POST',{timeout:60000});
    await submit.click();
    const response=await responsePromise;assert.equal(response.status(),201);
    const result=(await response.json()).data;assert.equal(result.stage,'PENDING_TEACHER');
    await page.getByText('补证已受理',{exact:true}).waitFor();
    const replay=await page.request.post(response.url(),{headers:await response.request().allHeaders(),data:response.request().postData()});
    assert.equal(replay.status(),201);assert.deepEqual((await replay.json()).data,result);
    const duplicate=await page.request.post(response.url(),{headers:{...await response.request().allHeaders(),'idempotency-key':crypto.randomUUID()},data:response.request().postData()});
    assert.equal(duplicate.status(),409);
    const workflow=await page.request.get(response.url().replace(/\/supplements$/,'/workflow'),{headers:{authorization:(await response.request().allHeaders()).authorization}});
    const data=(await workflow.json()).data;
    assert.equal(data.supplementUsed,true);assert.equal(data.stage,'PENDING_TEACHER');
    assert.equal(data.materials.filter(item=>item.materialVersion===1).length,1);
    assert.equal(data.materials.filter(item=>item.materialVersion===2).length,2);
    console.log(JSON.stringify({check:'STUDENT_BROWSER_SUPPLEMENT_CAPTURE_SUBMIT_REPLAY_ONCE_ORIGINAL_RETAINED',result:'PASS'}));
  }
  if(process.env.V81_CAMERA_RESULT==='1'){
    stage='CAMERA_RESULT';
    const {recordId,expectedHours:storedHours,actualDurationSeconds:storedSeconds}=JSON.parse(fs.readFileSync(submissionPath));
    await page.locator('[data-action="root.tab"][data-tab="checkin"]').click();
    await page.locator('[data-action="checkin.tab"][data-tab="records"]').click();
    const record=page.locator(`[data-action="checkin.openRecord"][data-record-id="${recordId}"]`);
    await record.waitFor();
    const resultText=await record.innerText();
    const expectedHours=['positive-credit','round2-positive-credit'].includes(process.env.V81_STUDENT_PURPOSE)?storedHours:0;
    assert.ok(Number.isFinite(expectedHours));
    assert.ok(resultText.includes(expectedHours>0?'有效 · 已计入':'有效 · 未计入'));
    const displayedHours=expectedHours%1===0?String(expectedHours):expectedHours.toFixed(1);
    assert.ok(resultText.includes(`${displayedHours}h`));
    if(['positive-credit','round2-positive-credit'].includes(process.env.V81_STUDENT_PURPOSE)){
      const headers={authorization:(await (await courseRulesResponse).request().allHeaders()).authorization};
      const read=await page.request.get(`http://127.0.0.1:4274/api/v1/exercise-records/${recordId}`,{headers});
      assert.equal(read.status(),200);assert.equal((await read.json()).data.creditedDurationSeconds,Math.min(Math.floor(storedSeconds/60),60)*60);
    }
    console.log(JSON.stringify({check:'STUDENT_READS_REVIEWED_CAMERA_RECORD',result:'PASS',creditedHours:expectedHours,displayedHours}));
    if(process.env.V81_EXPECT_PUBLIC_COMMENT){
      await record.click();
      await page.getByText(process.env.V81_EXPECT_PUBLIC_COMMENT,{exact:true}).waitFor();
      console.log(JSON.stringify({check:'STUDENT_BROWSER_DISPLAYS_TEACHER_PUBLIC_COMMENT',result:'PASS'}));
    }
  }
  if(process.env.V81_DENIED_WINDOW==='1'){
    stage='SERVER_WINDOW_DENIED';let attempts=0;
    await page.route('**/api/v1/exercise-sessions',async route=>{
      if(route.request().method()!=='POST')return route.continue();attempts++;
      await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({code:'SESSION_OUTSIDE_TIME_WINDOW',
        message:'Synthetic unavailable window',details:{},requestId:crypto.randomUUID()})});
    });
    await page.locator('[data-tab="checkin"]').click();
    await page.locator('[data-action="checkin.creditType"][data-value="general"]').click();
    await page.locator('[data-action="checkin.start"]').click();
    await page.locator('[data-action="checkin.ackHealth"]').click();
    await page.getByText(/当前不在课程开放时段或本人获准的补练时段内/).waitFor();
    assert.equal(attempts,1);assert.equal(await page.locator('[data-action="checkin.pause"]').count(),0);
    const local=await page.evaluate(async()=> (await import('/student/js/session.js')).loadSession());
    assert.equal(local,null);
    console.log(JSON.stringify({check:'SERVER_WINDOW_DENIAL_DOES_NOT_START_LOCAL_TIMER',result:'PASS',injectedDenial:true}));
  }
  if(cameraProbe){
    stage='CAMERA_START';
    await page.locator('[data-tab="checkin"]').click();
    if(process.env.V81_STALE_WINDOW==='1')await page.getByText('待核验',{exact:true}).waitFor();
    let session;
    if(resumeExisting){
      const headers={authorization:(await (await courseRulesResponse).request().allHeaders()).authorization};
      const active=await page.request.get('http://127.0.0.1:4274/api/v1/exercise-sessions/active',{headers});
      assert.equal(active.status(),200);session=(await active.json()).data;
      assert.equal(session.id,process.env.V81_EXPECT_SESSION_ID);assert.equal(session.status,'IN_PROGRESS');
      ownedSession={id:session.id,version:session.version,headers};
      await page.locator('[data-action="checkin.creditType"][data-value="general"]').click();
      await page.getByText('恢复运动',{exact:true}).click();
      await page.locator('[data-action="checkin.ackHealth"]').click();
    }else{
    await page.locator('[data-action="checkin.creditType"][data-value="general"]').click();
    await page.locator('[data-action="checkin.start"]').click();
    const startedResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/v1/exercise-sessions'&&response.request().method()==='POST');
    await page.locator('[data-action="checkin.ackHealth"]').click();
    const started=await startedResponse;assert.equal(started.status(),201);
    session=(await started.json()).data;
    ownedSession={id:session.id,version:session.version,headers:{authorization:(await started.request().allHeaders()).authorization}};
    }
    await page.locator('[data-action="checkin.capturePhoto"]').click();
    await page.locator('[data-action="checkin.cameraTakePhoto"]').click();
    await page.getByText(/照片 1\//).waitFor();
    for(const action of ['pause','resume']){
      stage='CAMERA_'+action.toUpperCase();
      const resultPromise=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith(`/exercise-sessions/${session.id}/${action}`)&&response.request().method()==='POST');
      await page.locator(`[data-action="checkin.${action}"]`).click();
      const result=await resultPromise;assert.ok(result.ok());ownedSession.version=(await result.json()).data.version;
    }
    console.log(JSON.stringify({check:'STUDENT_BROWSER_CAMERA_START_CAPTURE_PAUSE_RESUME',result:'PASS',cameraSource:'browser synthetic camera',durationCredit:'not tested'}));
    if(process.env.V81_PROOF_VIDEO==='1'){
      stage='PHOTO_VIDEO_SIZE';
      await page.evaluate(async()=>{const {app}=await import('/student/js/app.js');app.actions['checkin.videoNoticeContinue'](app);});
      await page.locator('[data-action="checkin.cameraStartVideo"]:enabled').waitFor();
      await page.locator('[data-action="checkin.cameraStartVideo"]').click();
      await page.waitForTimeout(10000);
      await page.locator('[data-action="checkin.cameraStopVideo"]').click();
      await page.evaluate(async()=>{window.bugfixApp=(await import('/student/js/app.js')).app;});
      await page.waitForFunction(()=>window.bugfixApp.ui.checkin.drafts.some(d=>d.type==='video'),null,{timeout:30000});
      const drafts=await page.evaluate(async()=>{const {app}=await import('/student/js/app.js'),{formatMediaSize}=await import('/student/js/media-size.js');return app.ui.checkin.drafts.map(d=>({type:d.type,bytes:d.byteCount,display:formatMediaSize(d.byteCount)}));});
      console.log(JSON.stringify({check:'CAPTURED_MATERIAL_BYTE_EVIDENCE',drafts}));
      assert.equal(drafts.length,2);assert.ok(drafts.every(d=>d.bytes>0&&d.display!=='0.0 MB'));
      console.log(JSON.stringify({check:'CAPTURED_PHOTO_VIDEO_REAL_BYTE_COUNTS',result:'PASS',drafts}));
    }
    if(realMinutes&&!resumeExisting){
      assert.equal(realMinutes,courseRules.minimum_minutes);
      stage='REAL_ELAPSED_WAIT';
      const until=Date.now()+realMinutes*60000+2000;
      console.log(JSON.stringify({check:'REAL_SERVER_ELAPSED_WAIT_STARTED',minutes:realMinutes,expectedFinish:new Date(until).toISOString()}));
      while(Date.now()<until){await new Promise(resolve=>setTimeout(resolve,Math.min(60000,until-Date.now())));console.log(JSON.stringify({check:'REAL_SERVER_ELAPSED_WAIT',remainingSeconds:Math.max(0,Math.ceil((until-Date.now())/1000))}));}
      for(const action of ['pause','resume']){
        const response=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith(`/exercise-sessions/${session.id}/${action}`)&&r.request().method()==='POST'&&r.status()!==401);
        await page.locator(`[data-action="checkin.${action}"]`).click();const result=await response;assert.equal(result.status(),200);ownedSession.version=(await result.json()).data.version;
      }
      console.log(JSON.stringify({check:'PAUSE_RESUME_AFTER_REAL_THRESHOLD',result:'PASS'}));
    }
    stage='CAMERA_FINISH';
    await page.locator('[data-action="checkin.requestFinish"]').click();
    const finishedResponse=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith(`/exercise-sessions/${session.id}/finish`)&&response.request().method()==='POST'&&response.status()!==401);
    await page.locator('[data-action="checkin.confirmFinish"]').click();
    const finished=await finishedResponse;assert.ok(finished.ok());
    const finalSession=(await finished.json()).data;
    assert.equal(finalSession.status,'COMPLETED');
    if(realMinutes)assert.ok(finalSession.actualDurationSeconds>=realMinutes*60);else assert.ok(finalSession.actualDurationSeconds<1800);
    ownedSession=null;
    await page.getByText('完成记录',{exact:true}).waitFor();
    const estimatedHours=realMinutes?Number((Math.min(Math.floor(finalSession.actualDurationSeconds/60),60)/60).toFixed(2)):0;
    await page.getByText(`有效运动时长 · 预计 ${estimatedHours} 小时，计入结果以审核为准`,{exact:true}).waitFor();
    console.log(JSON.stringify({check:realMinutes?'REAL_ELAPSED_SERVER_FINISH':'SHORT_SESSION_SERVER_FINISH_WITHOUT_CLIENT_CANCELLATION',result:'PASS',actualDurationSeconds:finalSession.actualDurationSeconds}));
    if(process.env.V81_STUDENT_SUBMIT==='1'){
      stage='CAMERA_UPLOAD_SUBMIT';
      await page.locator('[data-input="checkin.description"]').fill(realMinutes?'Synthetic camera evidence with real server elapsed time':'Synthetic camera evidence, intentionally below credit threshold');
      if(process.env.V81_DROP_SUBMIT_RESPONSE==='1'){
        assert.equal(process.env.V81_STUDENT_PURPOSE,'round2-submit-retry');
        let committedRecord,submittedCount=0;
        await page.route('**/api/v1/exercise-records/*/submit',async route=>{
          submittedCount++;
          const response=await route.fetch();assert.ok(response.ok());
          committedRecord=(await response.json()).data;
          await route.abort('connectionfailed');
        });
        await page.locator('[data-action="checkin.submit"]').click();
        await page.locator('.dialog-title').filter({hasText:'提交失败'}).waitFor({timeout:60000});
        assert.ok(committedRecord,'The real server must have committed the first submission: '+await page.locator('body').innerText());
        await page.locator('[data-action="dialog.close"]').click();
        await page.locator('[data-action="checkin.submit"]:enabled').click();
        await page.getByText('提交成功',{exact:true}).waitFor();
        assert.equal(submittedCount,1,'Retry must reconcile the committed record without submitting again');
        const matches=await page.evaluate(async sessionId=>{
          const api=await import('/student/js/api.js');
          const records=await api.listMyRecords();
          return records.filter(record=>record.sessionId===sessionId).map(record=>record.id);
        },session.id);
        assert.deepEqual(matches,[committedRecord.id]);
        fs.writeFileSync(submissionPath,JSON.stringify({recordId:committedRecord.id,expectedHours:0,sessionId:session.id,actualDurationSeconds:finalSession.actualDurationSeconds}));
        console.log(JSON.stringify({check:'REAL_COMMITTED_SUBMISSION_LOST_RESPONSE_RETRY_NO_DUPLICATE',result:'PASS'}));
      } else {
      const submittedResponse=page.waitForResponse(response=>/\/exercise-records\/[^/]+\/submit$/.test(new URL(response.url()).pathname)&&response.request().method()==='POST',{timeout:60000});
      await page.locator('[data-action="checkin.submit"]').click();
      const submitted=await submittedResponse;assert.ok(submitted.ok());
      const record=(await submitted.json()).data;
      assert.equal(record.creditedDurationSeconds,0);
      fs.writeFileSync(submissionPath,JSON.stringify({recordId:record.id,expectedHours:estimatedHours,sessionId:session.id,actualDurationSeconds:finalSession.actualDurationSeconds}));
      await page.getByText('提交成功',{exact:true}).waitFor();
      console.log(JSON.stringify({check:'STUDENT_BROWSER_CAMERA_UPLOAD_AND_SUBMIT',result:'PASS',creditExpected:0}));
      }
    }
  }
}catch(error){console.error(JSON.stringify({check:'STUDENT_BROWSER_SMTP_LOGIN',result:'FAIL',stage,type:error.name,message:error.message?.slice(0,1800),failedRequests:apiResponses.filter(item=>item.status>=400)}));
  if(stage==='RELOAD')console.error(JSON.stringify({reloadPage:(await diagnosticPage.locator('body').innerText()).replaceAll(state.accounts.student.email,'[SYNTHETIC_EMAIL]').slice(0,3000)}));
  process.exitCode=1;}
finally{
  if(ownedSession&&!resumeExisting){const cancelled=await diagnosticPage.request.post(`http://127.0.0.1:4274/api/v1/exercise-sessions/${ownedSession.id}/cancel`,{headers:{...ownedSession.headers,'idempotency-key':crypto.randomUUID()},data:{expectedVersion:ownedSession.version,reason:'Synthetic camera probe cleanup'}});
    console.log(JSON.stringify({check:'SYNTHETIC_CAMERA_SESSION_CLEANUP',status:cancelled.status()}));if(!cancelled.ok())process.exitCode=1;}
  await browser.close();
}
