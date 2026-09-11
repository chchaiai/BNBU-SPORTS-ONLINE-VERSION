// Exercise the real exemption and certification UI with isolated accounts and actual image uploads.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const cloud=process.env.BNBU_APPLICATION_CLOUD==='1';
const origin=cloud?'https://www.student.bnbusports.cn':'http://127.0.0.1:4274';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});

let page,teacherPage,stage="LOGIN";
try{
 const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai'});
 if(cloud){const fixture=JSON.parse(fs.readFileSync('.local/round2-cloud-long-private.json','utf8'));await context.addInitScript(auth=>{localStorage.setItem('bnbu.student.web.apiTokens',JSON.stringify(auth));localStorage.setItem('bnbu.student.web.session',JSON.stringify({kind:'api',accountId:auth.accountId,signedInAt:new Date().toISOString()}));},{...fixture.studentSession,userId:fixture.student.userId,accountId:'SYNTH-SESSION-'+fixture.student.email.split('.')[2].toUpperCase(),schemaVersion:2});}
 page=await context.newPage();page.setDefaultTimeout(60000);await page.goto(origin+'/student/');
 if(cloud)await page.getByRole('button',{name:'同意并继续',exact:true}).click();
 if(!cloud){
  const student=JSON.parse(fs.readFileSync('.local/v81-browser-state/student-round2-positive-credit.json','utf8'));
  await page.getByRole('button',{name:'同意并继续',exact:true}).click();await page.getByText('直接登录',{exact:true}).click();await page.getByText('邮箱验证码登录',{exact:true}).click();await page.getByPlaceholder('name@bnbu.edu.cn').fill(student.email);
  const prior=await(await fetch('http://127.0.0.1:18025/api/v1/messages?limit=50')).json(),ids=new Set(prior.messages.map(m=>m.ID));
  await page.getByRole('button',{name:'获取验证码',exact:true}).click();let code;
  for(let i=0;i<30&&!code;i++){const messages=await(await fetch('http://127.0.0.1:18025/api/v1/messages?limit=50')).json();const message=messages.messages.find(m=>!ids.has(m.ID)&&JSON.stringify(m.To).includes(student.email));if(message){const full=await(await fetch('http://127.0.0.1:18025/api/v1/message/'+message.ID)).json();code=(full.Text||'').match(/\b\d{6}\b/)?.[0];}if(!code)await new Promise(r=>setTimeout(r,500));}
  assert.ok(code);await page.getByPlaceholder('4–10 位数字').fill(code);await page.getByRole('button',{name:'登录',exact:true}).click();
 }
 await page.getByText('我的',{exact:true}).or(page.getByText('运动指引',{exact:true})).first().waitFor();
 await page.evaluate(async()=>{window.loadingProbeApp=(await import('/student/js/app.js')).app;});
 await page.waitForFunction(()=>!window.loadingProbeApp.state.isLoading&&!window.loadingProbeApp.state.isRestoringSession);
 if(await page.getByText('运动指引',{exact:true}).isVisible())await page.getByRole('button',{name:'跳过',exact:true}).click();
 const label=cloud?'cloud':'local',run=process.env.BNBU_APPLICATION_RUN??'';assert.match(run,/^[a-z0-9-]*$/);const file=`.local/exemption-acceptance-${label}${run?'-'+run:''}.json`;
 const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{applications:{}};
 const save=()=>fs.writeFileSync(file,JSON.stringify(state,null,2));
 const {createRequire}=await import('node:module');const sharp=createRequire(new URL('../../backend/package.json',import.meta.url))('sharp');const {syntheticPng}=await import('./synthetic-png.mjs');
 const png=syntheticPng(),jpeg=await sharp(png).jpeg().toBuffer(),webp=await sharp(png).webp().toBuffer();
 const image=(format)=>({name:`synthetic-proof.${format}`,mimeType:`image/${format}`,buffer:({png,jpeg,webp})[format]});
 const fixture=JSON.parse(fs.readFileSync(cloud?'.local/round2-cloud-long-private.json':'.local/v81-browser-state/state.json','utf8'));
 const teacher=cloud?fixture.teacher:fixture.accounts.teacher,portal=cloud?'https://www.teacher.bnbusports.cn':'http://localhost:3300';
 const tp=await browser.newPage();teacherPage=tp;tp.setDefaultTimeout(60000);await tp.goto(portal);await tp.locator('#login-account').fill(teacher.email);await tp.locator('#login-password').fill(teacher.password);
 const login=tp.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/auth/password-login')&&r.request().method()==='POST');await tp.getByRole('button',{name:'登录',exact:true}).click();const lr=await login;assert.equal(lr.status(),200);const token=(await lr.json()).data.accessToken;
 const read=async path=>{const r=await tp.request.get(portal+'/api/v1'+path,{headers:{authorization:`Bearer ${token}`}});assert.equal(r.status(),200);return(await r.json()).data;};
 const workspace=await page.evaluate(()=>({student:window.loadingProbeApp.state.workspace.student,courses:window.loadingProbeApp.state.workspace.courses}));
 const enrollment=workspace.courses.find(c=>c.isCurrent&&c.enrollmentId).enrollmentId;
 const progress=async()=>page.evaluate(async id=>(await (await import('/student/js/api.js')).listMyStudentProgress()).find(p=>p.enrollmentId===id),enrollment);
 state.baseline??=await progress();save();
 const openList=async()=>{await page.reload();await page.getByText('我的',{exact:true}).waitFor();await page.locator('[data-action="root.tab"][data-tab="profile"]').click();await page.locator('[data-action="profile.openExemption"]').click();};
 const openDetail=async type=>{await openList();await page.locator(`[data-action="exemption.open"][data-exemption-id="${state.applications[type].id}"]`).click();};
 const thumbs=async n=>page.waitForFunction(count=>{const imgs=[...document.querySelectorAll('[data-exemption-proof-thumbnail] img')];return imgs.length===count&&imgs.every(i=>i.complete&&i.naturalWidth>0);},n);
 async function submit(type){
  if(state.applications[type])return;
  stage='SUBMIT_'+type;await openList();await page.locator('[data-action="exemption.tab"][data-value="new"]').click();await page.locator(`[data-action="exemption.selectType"][data-value="${type}"]`).click();
  if(type==='team'||type==='club')await page.locator('#exemption-organization').fill('Synthetic acceptance '+type);
  await page.locator('#exemption-reason').fill('Synthetic application acceptance '+label+' '+type);
  if(!state.invalidFormatChecked){await page.locator('[data-exemption-input="gallery"]').setInputFiles({name:'not-allowed.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 synthetic')});assert.equal(await page.locator('.exemption-proof-row').count(),0);state.invalidFormatChecked=true;save();}
  await page.locator('[data-exemption-input="gallery"]').setInputFiles(type==='team'?[image('png'),image('webp')]:[image('jpeg')]);
  const completed=page.waitForResponse(r=>/\/exemption-applications\/[^/]+\/submit$/.test(new URL(r.url()).pathname)&&r.request().method()==='POST');await page.locator('[data-action="exemption.submit"]').click();const response=await completed;assert.equal(response.status(),200);state.applications[type]=(await response.json()).data;save();await openDetail(type);await thumbs(type==='team'?2:1);
  console.log(JSON.stringify({check:'APPLICATION_REAL_IMAGE_SUBMISSION',environment:label,result:'PASS',type,id:state.applications[type].id}));
 }
 async function review(type,decision,comment){
  stage='REVIEW_'+type+'_'+decision;const application=await read('/exemption-applications/'+state.applications[type].id);
  if(application.reviewComment===comment||application.publicComment===comment)return application;
  if((decision==='approve'&&application.status==='APPROVED')||(decision==='reject'&&application.status==='REJECTED')||(decision==='supplement'&&application.status==='SUPPLEMENT_REQUIRED'))return application;
  await tp.reload();await tp.getByRole('button',{name:'免测与认证',exact:true}).click();await tp.getByRole('tab',{name:/全部申请/}).click();
  const row=tp.getByRole('row').filter({hasText:application.reason}).filter({hasText:workspace.student.name});await row.getByRole('button',{name:'开始审核',exact:true}).click();const dialog=tp.getByRole('dialog');
  await dialog.locator('.teacher-original-media img').first().waitFor();await tp.waitForFunction(()=>[...document.querySelectorAll('.teacher-original-media img')].every(i=>i.naturalWidth>0));
  await dialog.getByRole('combobox',{name:/审核结果/}).click();await tp.getByRole('option',{name:({approve:'通过',reject:'驳回',supplement:'要求补材料'})[decision],exact:true}).click();
  await dialog.locator('textarea').fill(comment);
  if(type==='team'&&decision==='approve'){await dialog.getByLabel('课程运动抵扣',{exact:true}).fill('0.5');await dialog.getByLabel('其他运动抵扣',{exact:true}).fill('0.25');}
  const completed=tp.waitForResponse(r=>new URL(r.url()).pathname===`/api/v1/exemption-applications/${application.id}/review`&&r.request().method()==='POST');await dialog.getByRole('button',{name:'确认审核',exact:true}).click();const response=await completed;assert.equal(response.status(),200);
  console.log(JSON.stringify({check:'TEACHER_APPLICATION_REVIEW',environment:label,result:'PASS',type,decision}));return(await response.json()).data;
 }
 if(process.env.BNBU_APPLICATION_REVOKE==='1'){
  stage='REVOKE_TEAM';let current=await read('/exemption-applications/'+state.applications.team.id);
  if(current.status==='APPROVED'){
   await tp.reload();await tp.getByRole('button',{name:'免测与认证',exact:true}).click();await tp.getByRole('tab',{name:/全部申请/}).click();const row=tp.getByRole('row').filter({hasText:current.reason}).filter({hasText:workspace.student.name});await row.getByRole('button',{name:'更多',exact:true}).click();await tp.getByRole('menuitem',{name:'撤销抵扣',exact:true}).click();const dialog=tp.getByRole('dialog');await dialog.locator('textarea').fill('Synthetic recognition revoked for acceptance');const response=tp.waitForResponse(r=>new URL(r.url()).pathname===`/api/v1/activity-certification-applications/${current.id}/revoke`&&r.request().method()==='POST');await dialog.getByRole('button',{name:'确认审核',exact:true}).click();assert.equal((await response).status(),201);
  }
  current=await read('/exemption-applications/'+state.applications.team.id);assert.equal(current.status,'REVOKED');const history=await read(`/activity-certification-applications/${current.id}/recognition-allocation-revisions`);assert.equal(history.length,2);assert.equal(history[0].active,false);assert.equal(history.at(-1).courseSeconds,1800);assert.equal(history.at(-1).generalSeconds,900);
  await openDetail('team');await page.locator('.exemption-detail').getByText('已撤销',{exact:true}).waitFor();await thumbs(3);const after=await progress();assert.equal(after.courseRelated.effectiveSeconds,state.baseline.courseRelated.effectiveSeconds);assert.equal(after.general.effectiveSeconds,state.baseline.general.effectiveSeconds);assert.equal(after.courseRelated.recognizedSeconds,0);assert.equal(after.general.recognizedSeconds,0);
  await page.reload();await page.getByText('我的',{exact:true}).waitFor();await page.locator('[data-action="root.tab"][data-tab="grades"]').click();await page.getByText('免测',{exact:true}).waitFor();await page.locator('.tab-content').getByText('30 分钟',{exact:true}).first().waitFor();await page.screenshot({path:`.local/round2-evidence/${label}-application-revoked-progress.png`,fullPage:true});
  console.log(JSON.stringify({check:'APPLICATION_REVOKE_BROWSER',environment:label,result:'PASS',historicalAllocationRetained:true,imagesRetained:3,physicalStillExempt:true,progressRestoredToBaseline:true}));
 }else{
 const physical=String(workspace.student.gender).toLowerCase()==='female'?'800m':'1000m';
 const beforePhysical=await progress();await submit(physical);await review(physical,'approve','Synthetic physical exemption approved');await openDetail(physical);await page.locator('.exemption-detail').getByText('Synthetic physical exemption approved',{exact:true}).waitFor();await thumbs(1);
 const afterPhysical=await progress();assert.equal(afterPhysical.courseRelated.effectiveSeconds,beforePhysical.courseRelated.effectiveSeconds);assert.equal(afterPhysical.general.effectiveSeconds,beforePhysical.general.effectiveSeconds);
 await page.reload();await page.getByText('我的',{exact:true}).waitFor();await page.locator('[data-action="root.tab"][data-tab="grades"]').click();await page.getByText('免测',{exact:true}).waitFor();await page.screenshot({path:`.local/round2-evidence/${label}-application-physical.png`,fullPage:true});
 await submit('team');
 let team=await read('/exemption-applications/'+state.applications.team.id);
 if(team.status!=='APPROVED'){
  if(team.mediaIds.length<3){await review('team','supplement','Synthetic please add one proof image');stage='SUPPLEMENT';await openDetail('team');await page.locator('[data-action="exemption.supplement"]').click();await page.locator('#exemption-reason').fill('Synthetic application acceptance '+label+' team');await page.locator('[data-exemption-input="gallery"]').setInputFiles([image('jpeg'),image('png')]);await page.getByText('3 / 3 张图片',{exact:true}).waitFor();assert.equal(await page.locator('.exemption-proof-row').count(),1);assert.ok(await page.locator('[data-action="exemption.choosePhotos"]').isDisabled());const response=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/v1/exemption-applications/${team.id}/submit`&&r.request().method()==='POST');await page.locator('[data-action="exemption.submit"]').click();assert.equal((await response).status(),200);}
  await review('team','approve','Synthetic team recognition 30 course and 15 general minutes');
 }
 await openDetail('team');await thumbs(3);await page.locator('.exemption-detail').getByText('Synthetic team recognition 30 course and 15 general minutes',{exact:true}).waitFor();await page.screenshot({path:`.local/round2-evidence/${label}-application-team.png`,fullPage:true});
 const afterTeam=await progress();assert.equal(afterTeam.courseRelated.recognizedSeconds,1800);assert.equal(afterTeam.general.recognizedSeconds,900);assert.equal(afterTeam.courseRelated.effectiveSeconds,state.baseline.courseRelated.effectiveSeconds+1800);assert.equal(afterTeam.general.effectiveSeconds,state.baseline.general.effectiveSeconds+900);
 await page.reload();await page.getByText('我的',{exact:true}).waitFor();await page.locator('[data-action="root.tab"][data-tab="grades"]').click();await page.locator('.tab-content').getByText('75 分钟',{exact:true}).waitFor();await page.screenshot({path:`.local/round2-evidence/${label}-application-recognized-progress.png`,fullPage:true});
 await submit('club');await review('club','reject','Synthetic club proof not accepted');await openDetail('club');await page.locator('.exemption-detail').getByText('Synthetic club proof not accepted',{exact:true}).waitFor();
 await page.reload();await page.getByText('我的',{exact:true}).waitFor();await page.locator('[data-action="root.tab"][data-tab="dashboard"]').click();await page.locator('[data-action="dashboard.openNotifications"]').click();for(const comment of ['Synthetic physical exemption approved','Synthetic team recognition 30 course and 15 general minutes','Synthetic club proof not accepted'])await page.locator('.notice-row').filter({hasText:comment}).first().waitFor();
 await page.getByRole('dialog').screenshot({path:`.local/round2-evidence/${label}-application-notifications.png`,animations:'disabled'});
 console.log(JSON.stringify({check:'APPLICATION_FULL_BROWSER_FLOW',environment:label,result:'PASS',physicalNoCreditChange:true,teamCourseRecognizedSeconds:1800,teamGeneralRecognizedSeconds:900,cumulativeThreeImages:true,clubRejected:true,studentNotifications:true}));
 }
}catch(error){console.error(JSON.stringify({check:'APPLICATION_FULL_BROWSER_FLOW',result:'FAIL',stage,type:error.name,message:error.message.slice(0,1000)}));await page?.screenshot({path:'.local/round2-evidence/application-failure.png',fullPage:true});await teacherPage?.screenshot({path:'.local/round2-evidence/application-teacher-failure.png',fullPage:true});process.exitCode=1;}finally{await browser.close();}
