import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chromium } from '../../.local/browser-test/node_modules/playwright-core/index.mjs';

const state=JSON.parse(fs.readFileSync('.local/v81-browser-state/state.json'));
const fixture=JSON.parse(fs.readFileSync('.local/student-deletion-student-private.json'));
const student=fixture.membership.studentProfile;
assert.ok(fixture.studentNumber.startsWith('JOIN'));
const base='http://127.0.0.1:3199/api/v1';
function sql(text){return execFileSync('docker',['exec','-i','bnbu-v81-local-validation-sql-postgres-1','psql','-U','v81_probe','-d','v81_browser_test','-At','-v','ON_ERROR_STOP=1'],{input:text,encoding:'utf8'}).trim();}
const quote=value=>{assert.match(value,/^[0-9a-f-]{36}$/);return `'${value}'::uuid`;};
const sid=quote(student.id),uid=quote(student.userId),org=quote(student.organizationId);
async function api(path,token,body,key=randomUUID()){
  const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`} : {}),'idempotency-key':key},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,value:await response.json()};
}
const admin=(await api('/auth/password-login',null,{account:state.accounts.admin.email,password:state.accounts.admin.password})).value.data.accessToken;
const teacher=(await api('/auth/password-login',null,{account:state.accounts.teacher.email,password:state.accounts.teacher.password})).value.data.accessToken;
const profile=(await api('/students/'+student.id,admin)).value.data;
const body={expectedVersion:profile.version,confirmationStudentNumber:student.studentNumber,reason:'独立合成学生删除验收'};
const path='/admin/students/'+student.id+'/delete';
assert.equal((await api(path,teacher,body)).status,403);
assert.equal((await api(path,admin,{...body,confirmationStudentNumber:'WRONG'})).status,422);
assert.equal((await api(path,admin,{...body,expectedVersion:profile.version+1})).status,409);
assert.equal((await api(path,admin,{...body,reason:' '})).status,422);
assert.equal((await api('/me',fixture.membership.authSession.accessToken)).status,200);
const peers=()=>sql(`SELECT md5(coalesce(string_agg(r::text,'' ORDER BY r::text),'')) FROM (
  SELECT to_jsonb(s) r FROM student_profiles s WHERE organization_id=${org} AND id<>${sid}
  UNION ALL SELECT to_jsonb(e) FROM enrollments e WHERE organization_id=${org} AND student_id<>${sid}
  UNION ALL SELECT to_jsonb(r) FROM exercise_records r WHERE organization_id=${org} AND student_id<>${sid}) x;`);
const peerBefore=peers();
const records=JSON.parse(sql(`SELECT coalesce(json_agg(id),'[]') FROM exercise_records WHERE student_id=${sid} AND organization_id=${org};`));
assert.ok(records.length>0);
const media=JSON.parse(sql(`SELECT coalesce(json_agg(id),'[]') FROM media_evidence WHERE owner_student_id=${sid} AND organization_id=${org};`));
assert.equal(media.length,2);
console.log(JSON.stringify({check:'STUDENT_DELETE_PRECONDITIONS',result:'PASS',records:records.length,media:media.length,teacherDenied:true,wrongNumberDenied:true,staleVersionDenied:true,emptyReasonDenied:true}));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {
  const page=await browser.newPage();page.setDefaultTimeout(60000);
  await page.goto('http://localhost:3300/');
  await page.locator('#login-account').fill(state.accounts.admin.email);await page.locator('#login-password').fill(state.accounts.admin.password);
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.getByRole('button',{name:'用户与账号',exact:true}).click();
  await page.getByPlaceholder(/搜索/).first().fill(student.studentNumber);
  const row=page.getByRole('row').filter({hasText:student.studentNumber});await row.getByRole('button',{name:/详情/}).click();
  await page.getByRole('button',{name:'删除学生账号',exact:true}).click();
  const confirm=page.getByRole('button',{name:'永久删除学生及历史记录',exact:true});assert.ok(await confirm.isDisabled());
  await page.getByLabel('删除原因').fill(body.reason);
  await page.getByLabel(`输入学号 ${student.studentNumber} 确认`).fill(student.studentNumber);
  let lost=false,intentKey,receipt;
  await page.route('**'+path,async route=>{
    intentKey??=route.request().headers()['idempotency-key'];assert.equal(route.request().headers()['idempotency-key'],intentKey);
    const response=await route.fetch();assert.equal(response.status(),201);receipt=(await response.json()).data;
    if(!lost){lost=true;await route.abort('failed');}else await route.fulfill({response});
  });
  await confirm.click();await page.getByText('删除结果尚未确认，请按原内容重试核对结果。',{exact:true}).waitFor();
  await confirm.click();await confirm.waitFor({state:'hidden'});
  await page.reload();await page.getByRole('button',{name:'用户与账号',exact:true}).click();
  await page.getByPlaceholder(/搜索/).first().fill(student.studentNumber);
  await page.waitForTimeout(500);assert.equal(await page.getByRole('row').filter({hasText:student.studentNumber}).count(),0);
  assert.equal(receipt.id,student.id);assert.equal(receipt.deleted,true);
  await page.screenshot({path:'.local/student-deletion-browser.png',fullPage:true});
  assert.deepEqual((await api(path,admin,body,intentKey)).value.data,receipt);
  assert.equal((await api('/students/'+student.id,admin)).status,404);
  assert.equal((await api('/me',fixture.membership.authSession.accessToken)).status,401);
  assert.equal(peers(),peerBefore);
  const remaining=JSON.parse(sql(`SELECT json_build_object('users',(SELECT count(*) FROM users WHERE id=${uid}),
    'profiles',(SELECT count(*) FROM student_profiles WHERE id=${sid}), 'enrollments',(SELECT count(*) FROM enrollments WHERE student_id=${sid}),
    'records',(SELECT count(*) FROM exercise_records WHERE student_id=${sid}), 'sessions',(SELECT count(*) FROM exercise_sessions WHERE student_id=${sid}),
    'media',(SELECT count(*) FROM media_evidence WHERE owner_student_id=${sid}), 'loginSessions',(SELECT count(*) FROM auth_sessions WHERE user_id=${uid}),
    'scores',(SELECT count(*) FROM student_scores WHERE student_id=${sid}));`));
  assert.ok(Object.values(remaining).every(value=>value===0));
  for(let attempt=0;attempt<30;attempt++){
    if(sql(`SELECT count(*) FROM v81_student_media_erasure WHERE student_id=${sid} AND attempts>0;`)==='2')break;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert.equal(sql(`SELECT count(*) FROM v81_student_media_erasure WHERE student_id=${sid} AND attempts>0;`),'2');
  assert.equal(sql(`SELECT count(*) FROM v81_events WHERE resource_id=${sid} AND event_type='ACCOUNT_AND_HISTORY_DELETED';`),'1');
  console.log(JSON.stringify({check:'STUDENT_DELETE_BROWSER_HTTP_DATABASE',result:'PASS',remaining,peerDataUnchanged:true,lostResponseReplay:true,oldTokenRejected:true,deletionAuditCount:1,mediaCleanupAttempted:2}));
} finally {await browser.close();}
