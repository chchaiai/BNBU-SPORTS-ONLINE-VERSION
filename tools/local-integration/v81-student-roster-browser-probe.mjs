import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(fs.readFileSync(new URL('../../.local/v81-browser-state/state.json',import.meta.url)));
if(process.env.V81_ROSTER_STUDENT_EMAIL)state.accounts.student.email=process.env.V81_ROSTER_STUDENT_EMAIL;
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let stage='LOGIN', diagnosticPage;
try {
  const page=await browser.newPage();diagnosticPage=page;
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

  stage='COURSE_PAGE';
  const rosterRequests=[];
  page.on('request',request=>{if(new URL(request.url()).pathname.endsWith('/roster-status'))rosterRequests.push(request.url());});
  await page.reload();
  await page.getByText('运动指引',{exact:true}).waitFor();
  await page.getByRole('button',{name:'跳过',exact:true}).click();
  await page.getByText('课程',{exact:true}).click();
  await page.locator('[data-action="courses.open"]').first().click();
  await page.getByText('任课教师',{exact:true}).waitFor();
  const teacher=await page.evaluate(async()=>{
    const api=await import('/student/js/api.js');
    const sections=await api.listMyClassSections();
    const enrollments=await api.listMyEnrollments();
    const section=sections.find(section=>enrollments.some(e=>e.classSectionId===section.id&&e.status==='ACTIVE'));
    return api.getTeacherById(section.teacherId);
  });
  await page.getByText(teacher.fullName,{exact:true}).waitFor();
  console.log(JSON.stringify({check:'STUDENT_COURSE_TEACHER_SERVER_NAME',result:'PASS'}));
  const beforeProbeRequests=rosterRequests.length;
  const own=await page.evaluate(async()=>{
    const api=await import('/student/js/api.js');
    const enrollments=await api.listMyEnrollments();
    const result=[];
    for(const enrollment of enrollments) result.push(await api.getOwnRosterStatus(enrollment.id));
    return result;
  });
  assert.ok(own.length>0);
  const expectedKeys=['enrollmentId','classSectionId','generatedAt','available','rosterVersion','status','registrationComplete'].sort();
  for(const item of own)assert.deepEqual(Object.keys(item).sort(),expectedKeys);
  console.log(JSON.stringify({check:'STUDENT_OWN_ROSTER_REAL_API_CLOSED_PROJECTION',result:'PASS',enrollmentCount:own.length,statuses:own.map(item=>({available:item.available,status:item.status,registrationComplete:item.registrationComplete}))}));
  await page.getByText('任课教师',{exact:true}).waitFor();
  const labels={MATCHED:'本人已完成名单核对',PENDING_REGISTRATION:'本人注册或入班待核对，请联系教师',IDENTITY_CONFLICT:'本人身份信息待核对，请联系教师',EXTRA_IN_PLATFORM:'本人尚未匹配正式名单，请联系教师'};
  const expectedText=own[0].available?labels[own[0].status]:'正式名单尚未确认';
  await page.getByText(expectedText,{exact:true}).waitFor();
  stage='ROSTER_NETWORK_FAILURE';
  await page.route('**/roster-status',route=>route.abort('failed'));
  await page.getByRole('button',{name:'刷新本人名单状态',exact:true}).click();
  await page.getByText('本人名单状态暂不可用，请刷新重试',{exact:true}).waitFor();
  await page.unroute('**/roster-status');
  await page.getByRole('button',{name:'刷新本人名单状态',exact:true}).click();
  await page.getByText(expectedText,{exact:true}).waitFor();
  console.log(JSON.stringify({check:'STUDENT_OWN_ROSTER_DISPLAY_AND_NETWORK_RECOVERY',result:'PASS',status:own[0].status,available:own[0].available}));
  await page.screenshot({path:'.local/v81-browser-state/student-roster-current.png',fullPage:true,animations:'disabled'});
  console.log(JSON.stringify({check:'STUDENT_COURSE_PAGE_ROSTER_WIRING',result:beforeProbeRequests>0?'REQUESTED':'MISSING',automaticRosterRequestCount:beforeProbeRequests,syntheticIdentity:true}));
  assert.ok(beforeProbeRequests>0,'Course page never requested the student own roster status; API method exists without page wiring');
} catch(error){console.log(JSON.stringify({stage,error:error.message}));process.exitCode=1;}
finally{await browser.close();}
