import {formatLocalRecoveryTime} from '../../BNBU-Sports-Web-new/frontend/student/js/local-time.js';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
import {SignJWT,decodeJwt,importPKCS8} from '../../backend/node_modules/jose/dist/webapi/index.js';
const state=JSON.parse(fs.readFileSync(new URL('../../.local/v81-browser-state/state.json',import.meta.url)));
if(process.env.MAINTENANCE_PENDING_TASK==='1'){
 const student=JSON.parse(fs.readFileSync(new URL('../../.local/v81-browser-state/student-maintenance-supplement.json',import.meta.url)));
 state.accounts.student={email:student.email};
 assert.equal(process.env.MAINTENANCE_STUDENT_AUTH,'1');
 assert.equal(process.env.MAINTENANCE_PROOF_CLOCK,'1');
}
const api=async(path,token,body)=>{const r=await fetch('http://127.0.0.1:3199/api/v1'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`} : {}),'idempotency-key':randomUUID()},...(body?{body:JSON.stringify(body)}:{})});assert.ok(r.ok,`${path}: ${r.status}`);return (await r.json()).data;};
const login=await api('/auth/password-login',null,{account:state.accounts.admin.email,password:state.accounts.admin.password});
const before=await api('/system-mode',login.accessToken);assert.equal(before.mode,'NORMAL');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let stage='LOGIN', diagnosticStudent,diagnosticTeacher,restoring=false,studentReloadReads=0;
const refreshEvidence={student:[],teacher:[]};
try{
 const teacher=await browser.newPage();diagnosticTeacher=teacher;teacher.on('response',async response=>{if(new URL(response.url()).pathname==='/api/v1/system-mode/announcement')console.log(JSON.stringify({check:'TEACHER_NOTICE_HTTP',status:response.status(),body:await response.json().catch(()=>({navigationInterrupted:true}))}));});teacher.setDefaultTimeout(25000);
 await teacher.goto('http://localhost:3300/');await teacher.locator('#login-account').fill(state.accounts.teacher.email);await teacher.locator('#login-password').fill(state.accounts.teacher.password);await teacher.getByRole('button',{name:'登录',exact:true}).click();await teacher.getByRole('button',{name:'课程管理',exact:true}).waitFor();
 const student=await browser.newPage();diagnosticStudent=student;student.on('response',response=>{if(restoring&&new URL(response.url()).pathname==='/api/v1/enrollments'&&response.status()===200)studentReloadReads++;});student.on('response',async response=>{if(new URL(response.url()).pathname==='/api/v1/system-mode/announcement')console.log(JSON.stringify({check:'STUDENT_NOTICE_HTTP',status:response.status(),body:await response.json().catch(()=>({navigationInterrupted:true}))}));});student.setDefaultTimeout(25000);await student.goto('http://127.0.0.1:4274/student/');await student.getByRole('button',{name:'同意并继续'}).click();
 if(process.env.MAINTENANCE_STUDENT_AUTH==='1'){
  stage='STUDENT_LOGIN';await student.getByText('直接登录',{exact:true}).click();await student.getByText('邮箱验证码登录',{exact:true}).click();await student.getByPlaceholder('name@bnbu.edu.cn').fill(state.accounts.student.email);
  const old=await(await fetch('http://127.0.0.1:18025/api/v1/messages?limit=50')).json(),ids=new Set((old.messages??[]).map(m=>m.ID));
  await student.getByRole('button',{name:'获取验证码',exact:true}).click();let code;
  for(let i=0;i<30&&!code;i++){
   const messages=await(await fetch('http://127.0.0.1:18025/api/v1/messages?limit=50')).json();const message=messages.messages?.find(m=>!ids.has(m.ID)&&JSON.stringify(m.To??[]).includes(state.accounts.student.email));
   if(message){const mail=await(await fetch('http://127.0.0.1:18025/api/v1/message/'+message.ID)).json();code=(mail.Text??'').match(/\b\d{6}\b/)?.[0];}
   if(!code)await new Promise(r=>setTimeout(r,500));
  }
  assert.ok(code);await student.getByPlaceholder('4–10 位数字').fill(code);await student.getByRole('button',{name:'登录',exact:true}).click();await student.getByText('我的',{exact:true}).waitFor();
  await student.reload();await student.getByText('运动指引',{exact:true}).waitFor();await student.getByRole('button',{name:'跳过',exact:true}).click();await student.getByText('我的',{exact:true}).waitFor();
  console.log(JSON.stringify({check:'MAINTENANCE_STUDENT_REAL_SMTP_LOGIN_GUIDE_COMPLETED',result:'PASS'}));
 }
 if(process.env.MAINTENANCE_EXPIRED_TOKEN==='1'){
  assert.equal(state.database,'v81_browser_test');assert.equal(process.env.MAINTENANCE_STUDENT_AUTH,'1');
  const key=await importPKCS8(state.secrets.TOKEN_SIGNING_KEY,'EdDSA');
  for(const [name,page,storageKey] of [['teacher',teacher,'bnbu-portal-tokens-v1'],['student',student,'bnbu.student.web.apiTokens']]){
   page.on('response',async response=>{
    if(new URL(response.url()).pathname==='/api/v1/auth/refresh')refreshEvidence[name].push({status:response.status(),key:(await response.request().allHeaders())['idempotency-key']});
   });
   const tokens=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),storageKey);
   const claims=decodeJwt(tokens.accessToken);
   assert.equal(claims.organizationId,state.fixture.organizationId);
   tokens.accessToken=await new SignJWT({...claims,iat:Math.floor(Date.now()/1000)-3600,exp:Math.floor(Date.now()/1000)-60}).setProtectedHeader({alg:'EdDSA',typ:'JWT'}).sign(key);
   await page.evaluate(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key:storageKey,value:tokens});
  }
 }
 const stamp=randomUUID().slice(0,8),notice={titleZh:'合成维护公告 '+stamp,titleEn:'Synthetic maintenance '+stamp,bodyZh:'请等待本校维护完成 '+stamp,bodyEn:'Please wait for this school '+stamp,estimatedRecoveryAt:new Date(Date.now()+3600000).toISOString()};
 stage='MAINTENANCE';const active=await api('/system-mode/changes',login.accessToken,{mode:'MAINTENANCE',expectedVersion:before.policyVersion,reason:'Synthetic student teacher notice browser',...notice});
 if(process.env.MAINTENANCE_EXPIRED_TOKEN==='1'){
  for(const [page,modulePath] of [[teacher,'/app/api-client.ts'],[student,'/student/js/api.js']]){
   const result=await page.evaluate(async modulePath=>{try{await(await import(modulePath)).request('/me');return 'UNEXPECTED_SUCCESS';}catch(error){return error.code;}},modulePath);
   assert.equal(result,'SYSTEM_MAINTENANCE');
  }
 }
 if(process.env.MAINTENANCE_AUTO_POLL!=='1'){await teacher.reload();await student.reload();}
 await student.getByText(notice.bodyZh,{exact:true}).waitFor();await student.getByText(notice.titleZh,{exact:true}).waitFor();await student.getByText('预计恢复时间：'+formatLocalRecoveryTime(notice.estimatedRecoveryAt, 'zh'),{exact:true}).waitFor();
 if(process.env.MAINTENANCE_PROOF_CLOCK==='1'){
  const timing=await student.evaluate(async()=> (await (await import('/student/js/api.js')).getSystemModeStatus()).supplementTiming);
  if(process.env.MAINTENANCE_PENDING_TASK==='1'){
   assert.equal(timing.kind,'paused');assert.ok(timing.serverConfirmedRemainingSeconds>0);
   await student.waitForTimeout(1500);
   const repeated=await student.evaluate(async()=> (await (await import('/student/js/api.js')).getSystemModeStatus()).supplementTiming);
   assert.deepEqual(repeated,timing);
  }
  if(timing.kind==='paused')await student.getByText('计时已暂停',{exact:true}).waitFor();
  else if(timing.kind==='noActiveTask')assert.equal(await student.locator('[data-testid="maintenance.supplementTiming"]').count(),0);
  else if(timing.kind==='expiredBeforeMaintenance')await student.getByText('维护前已逾期',{exact:true}).waitFor();
  else await student.getByText('状态暂不可确认',{exact:true}).waitFor();
  console.log(JSON.stringify({check:'MAINTENANCE_CURRENT_STUDENT_TIMING',result:'PASS',timing}));
 }
 await teacher.getByText(notice.bodyZh,{exact:true}).waitFor();await teacher.getByText(notice.bodyEn,{exact:true}).waitFor();assert.ok((await teacher.locator('h1').innerText()).includes(notice.titleZh));assert.ok((await teacher.locator('h1').innerText()).includes(notice.titleEn));
 await teacher.getByText('预计恢复时间：'+formatLocalRecoveryTime(notice.estimatedRecoveryAt, 'zh'),{exact:true}).waitFor();
 await teacher.waitForTimeout(1000);await teacher.getByText(notice.bodyZh,{exact:true}).waitFor();
 assert.equal(await teacher.getByRole('button',{name:'课程管理',exact:true}).count(),0);assert.equal(await teacher.getByRole('button',{name:/管理员治理入口/}).count(),0);assert.equal(await student.getByText('直接登录',{exact:true}).count(),0);
 await student.screenshot({path:'.local/v81-browser-state/student-maintenance-notice.png',fullPage:true,animations:'disabled'});await teacher.screenshot({path:'.local/v81-browser-state/teacher-maintenance-notice.png',fullPage:true,animations:'disabled'});
 console.log(JSON.stringify({check:'STUDENT_PUBLIC_AND_TEACHER_MAINTENANCE_REAL_NOTICE_BILINGUAL_TIME_BUSINESS_GATE',result:'PASS'}));
 stage='RESTORE';restoring=true;await api('/system-mode/changes',login.accessToken,{mode:'NORMAL',reason:'Synthetic notice browser restore',expectedVersion:active.policyVersion});
 if(process.env.MAINTENANCE_AUTO_POLL!=='1'){await teacher.reload();await student.reload();}await teacher.getByRole('button',{name:'课程管理',exact:true}).waitFor();await student.getByText(process.env.MAINTENANCE_STUDENT_AUTH==='1'?'我的':'直接登录',{exact:true}).waitFor();
 if(process.env.MAINTENANCE_STUDENT_AUTH==='1'){
  const deadline=Date.now()+10000;
  while(!studentReloadReads&&Date.now()<deadline)await student.waitForTimeout(100);
  assert.ok(studentReloadReads>0,'Restored student workspace must reread enrollments from backend');
 }
 if(process.env.MAINTENANCE_PENDING_TASK==='1'){
  const {items:todos}=await student.evaluate(async()=> (await import('/student/js/api.js')).listOwnProofTodos());
  assert.equal(todos.length,1);assert.equal(todos[0].paused,false);assert.equal(todos[0].expired,false);
  console.log(JSON.stringify({check:'PENDING_SUPPLEMENT_RESUMED_AFTER_NORMAL',result:'PASS'}));
 }
 console.log(JSON.stringify({check:'TEACHER_SESSION_AND_STUDENT_PUBLIC_ENTRY_RESTORED_AFTER_NORMAL',result:'PASS',automaticPolling:process.env.MAINTENANCE_AUTO_POLL==='1',authenticatedStudent:process.env.MAINTENANCE_STUDENT_AUTH==='1',studentReloadReads}));
 if(process.env.MAINTENANCE_EXPIRED_TOKEN==='1'){
  for(const [client,events] of Object.entries(refreshEvidence)){
   const rejected=events.find(event=>event.status===503),recovered=events.find(event=>event.status===200);
   assert.ok(rejected&&recovered,client+' must exercise real refresh rejection and recovery');assert.notEqual(rejected.key,recovered.key);
   console.log(JSON.stringify({check:'REAL_EXPIRED_TOKEN_MAINTENANCE_REFRESH_RECOVERS_WITH_NEW_KEY',client,result:'PASS'}));
  }
 }
}catch(error){if(diagnosticTeacher)console.log(JSON.stringify({teacherText:(await diagnosticTeacher.locator('body').innerText()).slice(0,1600)}));if(diagnosticStudent){await diagnosticStudent.screenshot({path:'.local/v81-browser-state/notice-failure.png',fullPage:true});console.log(JSON.stringify({pageText:(await diagnosticStudent.locator('body').innerText()).slice(0,1800)}));}console.log(JSON.stringify({stage,error:error.message}));process.exitCode=1;}
finally{try{const cleanup=await api('/auth/password-login',null,{account:state.accounts.admin.email,password:state.accounts.admin.password});const history=await api('/system-mode/history',cleanup.accessToken),latest=history[0];if(latest?.facts?.to==='MAINTENANCE')await api('/system-mode/changes',cleanup.accessToken,{mode:'NORMAL',reason:'Synthetic notice probe cleanup',expectedVersion:latest.version});}finally{await browser.close();}}
