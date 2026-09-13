import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const cloud=process.env.BNBU_CASCADE_CLOUD==='1';
const f=JSON.parse(fs.readFileSync(cloud?'.local/course-delete-cloud-private.json':'.local/v81-browser-state/course-delete-private.json'));
const base=cloud?'https://www.student.bnbusports.cn/api/v1':'http://127.0.0.1:3199/api/v1';
const sql=text=>execFileSync('docker',['exec','-i','bnbu-v81-local-validation-sql-postgres-1','psql','-U','v81_probe','-d','v81_browser_test','-At','-v','ON_ERROR_STOP=1'],{input:text,encoding:'utf8'}).trim();
async function api(path,token,body,key=randomUUID()){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','idempotency-key':key,...(token?{authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,value:await r.json()};}

const teacherSession=await api('/auth/password-login',null,{account:f.teacherLogin.email,password:f.teacherLogin.password});assert.equal(teacherSession.status,200);
const token=teacherSession.value.data.accessToken;console.log('Teacher session ready');
const section=(await api('/class-sections/'+f.fixture.teacherAActiveSectionId,token)).value.data;
const path='/class-sections/'+section.id+'/delete',body={expectedVersion:section.version,confirmationCourseName:section.displayName,reason:'Synthetic course deletion acceptance',confirmCourseErasure:true};
const admin=(await api('/auth/password-login',null,{account:f.admin.email,password:f.admin.password})).value.data.accessToken;
assert.equal((await api(path,admin,body)).status,403);
assert.equal((await api(path,token,{...body,confirmationCourseName:'WRONG'})).status,422);
assert.equal((await api(path,token,{...body,confirmCourseErasure:false})).status,422);
assert.equal((await api(path,token,{...body,expectedVersion:body.expectedVersion+1})).status,409);
assert.equal((await api('/class-sections/'+f.fixture.teacherBActiveSectionId+'/delete',token,body)).status,403);
assert.equal((await api('/exercise-records/'+f.record.recordId,token)).status,200);
if(!cloud){
 sql(`CREATE TABLE synthetic_course_erasure_guard(course_id uuid REFERENCES class_sections(id)); INSERT INTO synthetic_course_erasure_guard VALUES('${section.id}');`);
 try{assert.equal((await api(path,token,body)).status,500);assert.equal((await api('/exercise-records/'+f.record.recordId,token)).status,200);}
 finally{sql('DROP TABLE synthetic_course_erasure_guard');}
}
console.log('API scope and rollback checks passed');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let page;try{
 page=await browser.newPage({viewport:{width:1366,height:1000}});page.setDefaultTimeout(30000);
 await page.goto(cloud?'https://www.teacher.bnbusports.cn/':'http://localhost:3300/');
 await page.locator('#login-account').fill(f.teacherLogin.email);await page.locator('#login-password').fill(f.teacherLogin.password);await page.getByRole('button',{name:'登录',exact:true}).click();
 const card=page.locator('[data-class-section-id="'+section.id+'"]');
 await card.getByRole('button',{name:/进入课程/}).click();
 const deletion=page.getByRole('region',{name:'彻底删除课程'});await deletion.getByRole('button',{name:'彻底删除课程',exact:true}).click();
 await deletion.locator('#course-delete-name').fill(section.displayName);await deletion.locator('textarea').fill(body.reason);await deletion.getByRole('checkbox').check();
 assert.match(await deletion.innerText(),/保留学生账号/);assert.match(await deletion.innerText(),/其他课程数据/);
 await deletion.screenshot({path:'.local/course-delete-confirm-'+(cloud?'cloud':'local')+'.png'});
 const keys=[];let drop=true;
 await page.route('**/api/v1'+path,async route=>{keys.push(route.request().headers()['idempotency-key']);const response=await route.fetch({timeout:180000});if(drop&&response.status()===201){drop=false;return route.abort('failed');}await route.fulfill({response});});
 await deletion.getByRole('button',{name:'确认彻底删除课程',exact:true}).click();await deletion.getByRole('alert').waitFor();await deletion.getByRole('button',{name:'重试原删除请求',exact:true}).click();await deletion.waitFor({state:'hidden'});assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);
 await page.reload();await page.getByRole('button',{name:/新建课程/}).waitFor();assert.equal(await page.locator('[data-class-section-id="'+section.id+'"]').count(),0);
 assert.equal((await api('/exercise-records/'+f.record.recordId,token)).status,404);
 for(const student of f.students)assert.equal((await api('/students/'+student.studentId,admin)).status,200);
 assert.equal((await api('/students/'+f.record.studentId,admin)).status,200);
 assert.equal((await api('/class-sections/'+f.fixture.teacherBActiveSectionId,admin)).status,200);
 console.log(JSON.stringify({check:'COURSE_DELETE_BROWSER',environment:cloud?'cloud':'local',result:'PASS',recordsRemoved:true,studentAccountsRetained:true,otherCourseRetained:true,lostResponseReplay:true}));
}catch(error){if(page){await page.screenshot({path:'.local/course-delete-failure.png'});console.log((await page.locator('body').innerText()).slice(0,2500));}throw error;}finally{await browser.close();}
