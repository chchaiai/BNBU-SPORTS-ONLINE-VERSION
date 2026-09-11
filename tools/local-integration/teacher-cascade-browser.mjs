import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const cloud=process.env.BNBU_CASCADE_CLOUD==='1';
const f=JSON.parse(fs.readFileSync(cloud?'.local/teacher-cascade-cloud-private.json':'.local/v81-browser-state/teacher-cascade-private.json'));
const base=cloud?'https://www.student.bnbusports.cn/api/v1':'http://127.0.0.1:3199/api/v1';
const sql=text=>execFileSync('docker',['exec','-i','bnbu-v81-local-validation-sql-postgres-1','psql','-U','v81_probe','-d','v81_browser_test','-At','-v','ON_ERROR_STOP=1'],{input:text,encoding:'utf8'}).trim();
async function api(path,token,body,key=randomUUID()){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','idempotency-key':key,...(token?{authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,value:await r.json()};}
const teacherSession=await api('/auth/password-login',null,{account:f.teacherLogin.email,password:f.teacherLogin.password});assert.equal(teacherSession.status,200);
const admin=(await api('/auth/password-login',null,{account:f.admin.email,password:f.admin.password})).value.data.accessToken;
const path='/admin/teachers/'+f.teacher.id+'/delete',body={expectedVersion:f.teacher.version,confirmationEmployeeNumber:f.teacher.employeeNumber,reason:'Synthetic teacher cascade acceptance',confirmStudentErasure:true};
assert.equal((await api(path,teacherSession.value.data.accessToken,body)).status,403);
assert.equal((await api(path,admin,{...body,confirmationEmployeeNumber:'WRONG'})).status,422);
assert.equal((await api(path,admin,{...body,confirmStudentErasure:false})).status,422);
assert.equal((await api(path,admin,{...body,expectedVersion:body.expectedVersion+1})).status,409);
if(!cloud){
 const last=f.students.map(s=>s.studentId).sort().at(-1);assert.match(last,/^[a-f0-9-]{36}$/);
 sql(`CREATE TABLE synthetic_teacher_erasure_guard(student_id uuid REFERENCES student_profiles(id)); INSERT INTO synthetic_teacher_erasure_guard VALUES('${last}');`);
 try{assert.equal((await api(path,admin,body)).status,500);
  assert.equal(sql(`SELECT count(*) FROM student_profiles WHERE id IN (${f.students.map(s=>`'${s.studentId}'`).join(',')})`),'3');
  assert.equal(sql(`SELECT status FROM class_sections WHERE id='${f.fixture.teacherAActiveSectionId}'`),'ACTIVE');
  assert.equal(sql(`SELECT count(*) FROM teacher_profiles WHERE id='${f.teacher.id}'`),'1');
  console.log(JSON.stringify({check:'TEACHER_CASCADE_FAILED_LAST_STUDENT_ROLLBACK',result:'PASS',retainedStudents:3}));
 }finally{sql('DROP TABLE synthetic_teacher_erasure_guard');}
}
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1366,height:1000}});page.setDefaultTimeout(120000);
 await page.goto(cloud?'https://www.teacher.bnbusports.cn/':'http://localhost:3300/');
 await page.locator('#login-account').fill(f.admin.email);await page.locator('#login-password').pressSequentially(f.admin.password);
 const toggle=page.getByRole('button',{name:'显示或隐藏密码',exact:true});assert.equal(await toggle.count(),1);
 assert.equal(await page.evaluate(()=>Array.from(document.styleSheets).some(sheet=>{
   try{return Array.from(sheet.cssRules).some(rule=>rule.cssText.includes('#login-password::-ms-reveal')&&rule.cssText.includes('display: none'));}catch{return false;}
 })),true);
 await toggle.click();assert.equal(await page.locator('#login-password').getAttribute('type'),'text');await toggle.click();assert.equal(await page.locator('#login-password').getAttribute('type'),'password');
 await page.screenshot({path:'.local/teacher-cascade-password-'+(cloud?'cloud':'local')+'.png'});
 await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('button',{name:'用户与账号',exact:true}).click();await page.getByRole('button',{name:/教师账户/}).click();
 await page.getByRole('row').filter({hasText:f.teacher.employeeNumber}).getByRole('button',{name:/管理账号/}).click();await page.getByRole('button',{name:'删除教师账号',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'删除教师账号'});await dialog.locator('textarea').fill(body.reason);await dialog.locator('input').fill(f.teacher.employeeNumber);assert.match(await dialog.innerText(),/其他教师课程/);
 const keys=[];let drop=true;
 await page.route('**/api/v1'+path,async route=>{keys.push(route.request().headers()['idempotency-key']);const response=await route.fetch({timeout:180000});if(drop&&response.status()===201){drop=false;return route.abort('failed');}await route.fulfill({response});});
 await dialog.getByRole('button',{name:'确认删除账号',exact:true}).click();await dialog.getByRole('status').waitFor();await dialog.getByRole('button',{name:'确认删除账号',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);
 await page.reload();await page.getByRole('button',{name:'用户与账号',exact:true}).click();await page.getByRole('button',{name:/教师账户/}).click();await page.getByRole('button',{name:'批量建立教师',exact:true}).waitFor();assert.equal(await page.getByRole('row').filter({hasText:f.teacher.employeeNumber}).count(),0);
 assert.equal((await api('/me',teacherSession.value.data.accessToken)).status,401);
 for(const student of f.students)assert.equal((await api('/students/'+student.studentId,admin)).status,404);
 assert.equal((await api('/students/'+f.peer.studentId,admin)).status,200);
 console.log(JSON.stringify({check:'TEACHER_CASCADE_BROWSER',environment:cloud?'cloud':'local',result:'PASS',studentCount:f.students.length,oldTeacherSessionRejected:true,peerRetained:true,lostResponseReplay:true,passwordVisibilityButtonCount:1,nativePasswordRevealHidden:true}));
}finally{await browser.close();}
