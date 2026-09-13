import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium,webkit,firefox} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const fixture=JSON.parse(fs.readFileSync('.local/v81-browser-state/demand-fixture.json','utf8'));
const engine=process.env.BNBU_BROWSER || 'chromium';assert.ok(['chromium','webkit','firefox'].includes(engine));
const output='.local/demand-followup-evidence'+(engine==='chromium'?'':'/'+engine);fs.mkdirSync(output,{recursive:true});
const browser=await ({chromium,webkit,firefox}[engine]).launch({...(engine==='chromium'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{}),headless:true});
const errors=[],checks=[];
const pass=check=>{checks.push(check);console.log(JSON.stringify({check,result:'PASS'}));};
async function pageFor(viewport) {const context=await browser.newContext({viewport,timezoneId:'Asia/Shanghai'}),page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));return page;}
async function stateReady(page) {for(let n=0;n<150;n++){if(await page.evaluate(async()=>{const {app}=await import('/student/js/app.js');return app.state.authenticated&&!app.state.isLoading&&!app.state.isRestoringSession;}))return;await new Promise(r=>setTimeout(r,200));}throw new Error('Student workspace did not settle');}
try {
 const student=await pageFor({width:390,height:844});
 await student.goto('http://127.0.0.1:4274/student/?api=local&org='+encodeURIComponent(fixture.organizationCode));
 await student.getByRole('button',{name:'同意并继续',exact:true}).click();await student.getByText('直接登录',{exact:true}).click();await student.getByText('邮箱验证码登录',{exact:true}).click();
 await student.getByPlaceholder('name@bnbu.edu.cn').fill(fixture.studentEmail);
 const prior=await(await fetch('http://127.0.0.1:18025/api/v1/messages?limit=100')).json(),ids=new Set(prior.messages.map(m=>m.ID));
 await student.getByRole('button',{name:'获取验证码',exact:true}).click();let code;
 for(let n=0;n<40&&!code;n++){const messages=await(await fetch('http://127.0.0.1:18025/api/v1/messages?limit=100')).json();const message=messages.messages.find(m=>!ids.has(m.ID)&&JSON.stringify(m.To).includes(fixture.studentEmail));if(message){const full=await(await fetch('http://127.0.0.1:18025/api/v1/message/'+message.ID)).json();code=full.Text.match(/\b\d{6}\b/)?.[0];}if(!code)await new Promise(r=>setTimeout(r,500));}
 assert.ok(code);await student.getByPlaceholder('4–10 位数字').fill(code);await student.getByRole('button',{name:'登录',exact:true}).click();await stateReady(student);
 if(await student.getByRole('button',{name:'跳过',exact:true}).isVisible())await student.getByRole('button',{name:'跳过',exact:true}).click();
 assert.equal(await student.getByText('开始前核验运动时段',{exact:true}).count(),0);
 await student.locator('[data-action="root.tab"][data-tab="profile"]').click();
 assert.equal(await student.getByText('本机照片原图',{exact:true}).count(),0);
 await student.getByRole('button',{name:'去完善',exact:true}).click();
 await student.locator('[data-field="collegeName"]').fill('Synthetic UI College');
 await student.locator('[data-field="regionCode"]').selectOption('OTHER');
 await student.locator('[data-field="otherRegionName"]').fill('Canada');
 const saving=student.waitForResponse(response=>response.url().endsWith('/me/student-profile')&&response.request().method()==='POST');
 await student.getByRole('button',{name:'保存资料',exact:true}).click();assert.equal((await saving).status(),200);
 await student.locator('[data-profile-details-form]').waitFor({state:'detached'});await stateReady(student);
 await student.getByText('Canada',{exact:true}).waitFor();
 await student.screenshot({path:output+'/student-account-completed.png',fullPage:true});
 assert.equal(await student.getByRole('button',{name:'去完善',exact:true}).count(),0);
 const account=await student.evaluate(async()=>{const {app}=await import('/student/js/app.js');return app.state.workspace.student;});
 assert.ok(account.className);assert.equal(account.otherRegionName,'Canada');
 await student.reload();await stateReady(student);
 const persisted=await student.evaluate(async()=>{const {app}=await import('/student/js/app.js');return app.state.workspace.student.otherRegionName;});assert.equal(persisted,'Canada');
 pass('STUDENT_PROFILE_PROMPT_EDIT_SAVE_RELOAD_AND_CURRENT_CLASS');
 await student.locator('[data-action="root.tab"][data-tab="checkin"]').click();
 assert.equal(await student.getByText('本机照片原图',{exact:true}).count(),0);
 const glyphs=await student.evaluate(async()=>{const {SPORT_OPTIONS}=await import('/student/js/sports-catalog.js');const {icon}=await import('/student/js/icons.js');return SPORT_OPTIONS.map(s=>icon(s.icon));});
 assert.equal(new Set(glyphs).size,glyphs.length);
 await student.screenshot({path:output+'/student-sports.png',fullPage:true});pass('DISTINCT_SPORT_GLYPHS_AND_REMOVED_ORIGINAL_ENTRIES');

 const teacher=await pageFor({width:1280,height:950});
 await teacher.goto('http://127.0.0.1:4275/');await teacher.locator('#login-account').fill(fixture.teacherEmail);await teacher.locator('#login-password').fill(fixture.password);await teacher.getByRole('button',{name:'登录',exact:true}).click();
 await teacher.getByRole('button',{name:'通知',exact:true}).waitFor();
 const card=teacher.locator('article.teacher-course-card').filter({hasText:'Synthetic Active Course 1'});
 await card.getByRole('button',{name:/学生名单/}).click();await teacher.getByRole('dialog').getByText('Synthetic Permanent Student',{exact:true}).waitFor();await teacher.screenshot({path:output+'/teacher-student-list.png'});
 await teacher.getByRole('dialog').getByRole('button',{name:/关闭/}).first().click();
 await card.getByRole('button',{name:'进入课程'}).click();
 await teacher.locator('#course-minimum-minutes').fill('40');await teacher.locator('#course-weekly-limit').fill('8');await teacher.locator('#course-daily-limit').fill('4');
 await teacher.getByRole('button',{name:'保存设置',exact:true}).click();await teacher.getByText('规则已保存，仅对之后新增的记录生效。',{exact:true}).waitFor();
 await card.getByRole('button',{name:'进入课程'}).click();await teacher.getByRole('button',{name:'保存补卡设置',exact:true}).waitFor();
 await teacher.waitForFunction(()=>document.querySelector('#course-minimum-minutes')?.value==='40');
 assert.equal(await teacher.locator('#course-minimum-minutes').inputValue(),'40');assert.equal(await teacher.locator('#course-daily-limit').inputValue(),'4');assert.equal(await teacher.locator('#course-weekly-limit').inputValue(),'8');
 const history=teacher.getByRole('region',{name:'历史补卡设置'});await history.screenshot({path:output+'/teacher-history-layout.png'});
 await teacher.getByRole('region',{name:'课程结算'}).screenshot({path:output+'/teacher-settlement-layout.png'});
 pass('TEACHER_COURSE_LIST_RULE_EDIT_PERSISTENCE_AND_LAYOUT');

 const admin=await pageFor({width:1440,height:1000});await admin.goto('http://127.0.0.1:4275/');await admin.locator('#login-account').fill(fixture.adminEmail);await admin.locator('#login-password').fill(fixture.password);await admin.getByRole('button',{name:'登录',exact:true}).click();
 await admin.getByRole('button',{name:'用户与账号',exact:true}).click();
 const row=admin.getByRole('row').filter({hasText:'Synthetic Permanent Student'});await row.getByRole('button',{name:/详情/}).click();await admin.getByText(fixture.studentEmail,{exact:true}).waitFor();
 await admin.screenshot({path:output+'/admin-student-email-detail.png'});
 await admin.getByRole('dialog').getByRole('button',{name:/关闭/}).first().click();
 await admin.getByRole('button',{name:/教师账户/}).click();await admin.screenshot({path:output+'/admin-teacher-filters.png'});
 assert.ok(await admin.getByText('重置筛选',{exact:true}).isVisible());
 pass('ADMIN_EMAIL_DETAILS_AND_STUDENT_TEACHER_FILTERS');
 assert.deepEqual(errors,[]);
 fs.writeFileSync(output+'/browser-checks.json',JSON.stringify({checks,errors},null,2)+'\n');
}finally{await browser.close();}
