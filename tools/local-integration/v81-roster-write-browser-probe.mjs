import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
import {CFB,utils,write} from '../../BNBU-Sports-Web-new/portal-teacher-admin/node_modules/xlsx/xlsx.mjs';
const state=JSON.parse(fs.readFileSync(new URL('../../.local/v81-browser-state/state.json',import.meta.url)));
const format=process.env.V81_ROSTER_FORMAT??'csv';assert.ok(['csv','xlsx'].includes(format));
const rows=[['学号','姓名'],['000001','Synthetic Roster One'],['000002','Synthetic Roster Two']];
const duplicates=process.env.V81_ROSTER_DUPLICATES==='1';
if(duplicates)rows[2][0]='000001';
const workbook=utils.book_new();utils.book_append_sheet(workbook,utils.aoa_to_sheet(rows),'名单');
let bytes=format==='csv'?Buffer.from('\uFEFF'+rows.map(row=>row.join(',')).join('\r\n')+'\r\n'):write(workbook,{type:'buffer',bookType:'xlsx'});
if(process.env.V81_ROSTER_LARGE==='1') {
  assert.equal(format,'xlsx');
  const zip=CFB.read(bytes,{type:'buffer'});
  CFB.utils.cfb_add(zip,'synthetic-attachment.bin',Buffer.alloc(1));
  const overhead=CFB.write(zip,{type:'buffer',fileType:'zip',compression:false}).length-1;
  const target=process.env.V81_ROSTER_EXACT_LIMIT==='1'?100*1024*1024:12*1024*1024;
  CFB.utils.cfb_add(zip,'synthetic-attachment.bin',Buffer.alloc(target-overhead,97));
  bytes=Buffer.from(CFB.write(zip,{type:'buffer',fileType:'zip',compression:false}));
  assert.equal(bytes.length,target);
}
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let stage='LOGIN';const failures=[];
try{
  const page=await browser.newPage();page.setDefaultTimeout(process.env.V81_ROSTER_EXACT_LIMIT==='1'?60000:20000);
  page.on('response',response=>{const path=new URL(response.url()).pathname;if(path.startsWith('/api/v1/')&&response.status()>=400)failures.push({path,status:response.status()});});
  await page.goto('http://localhost:3300/');
  await page.getByLabel('学校邮箱').fill(state.accounts.teacher.email);
  await page.locator('#login-password').fill(state.accounts.teacher.password);
  await page.getByRole('button',{name:'登录',exact:true}).click();
  stage='CREATE_COURSE';
  await page.getByRole('button',{name:/新建课程/}).click();
  const name=`Synthetic Roster ${format} ${randomUUID()}`;
  await page.getByPlaceholder('如 大学体育（一）').fill(name);
  const createdPromise=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/v1/teacher/courses'&&response.request().method()==='POST');
  await page.getByRole('button',{name:'创建课程',exact:true}).click();
  const created=await createdPromise;assert.equal(created.status(),201);const course=(await created.json()).data;
  stage='IMPORT';
  await page.locator('.teacher-course-card').filter({hasText:name}).getByRole('button',{name:'名单对齐',exact:true}).click();
  await page.getByRole('button',{name:'导入官方名单',exact:true}).click();
  if(bytes.length>50*1024*1024) {
    const path=fileURLToPath(new URL('../../.local/v81-browser-state/synthetic-roster-limit.xlsx',import.meta.url));
    fs.writeFileSync(path,bytes);
    await page.getByLabel('选择学校官方课程名单文件').setInputFiles(path);
  } else await page.getByLabel('选择学校官方课程名单文件').setInputFiles({name:`synthetic-roster.${format}`,mimeType:format==='csv'?'text/csv':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bytes});
  await page.getByRole('button',{name:'本地预检',exact:true}).click();
  let uploadCount=0,committed,releaseLost;
  const keys=[],lost=new Promise(resolve=>{releaseLost=resolve;});
  page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname.endsWith('/roster-imports'))uploadCount++;});
  let first=true;
  await page.route('**/api/v1/roster-imports/*/confirmation',async route=>{
    if(route.request().method()!=='POST'){await route.continue();return;}
    keys.push(route.request().headers()['idempotency-key']);
    if(first){first=false;const response=await route.fetch();assert.equal(response.status(),201);committed=(await response.json()).data;await route.abort('failed');releaseLost();}
    else await route.continue();
  });
  const uploadPromise=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/v1/class-sections/${course.id}/roster-imports`&&response.request().method()==='POST');
  const confirmedPromise=page.waitForResponse(response=>/\/roster-imports\/[^/]+\/confirmation$/.test(new URL(response.url()).pathname)&&response.request().method()==='POST');
  void uploadPromise.catch(()=>{});void confirmedPromise.catch(()=>{});
  stage='UPLOAD_CLICK';
  await page.getByRole('button',{name:'确认创建新版本',exact:true}).click();
  stage='UPLOAD_RESPONSE';
  const uploaded=await uploadPromise;assert.equal(uploaded.status(),201);
  stage='CONFIRMATION_RETRY';await lost;
  // Chromium can evict the upload response from its inspector cache for large requests.
  // Read the source ID from the independently captured committed confirmation instead.
  const source={id:committed.rosterImportId};assert.match(source.id,/^[0-9a-f-]{36}$/);
  await page.getByRole('button',{name:'确认创建新版本',exact:true}).click();
  const confirmed=await confirmedPromise;assert.equal(confirmed.status(),201);
  assert.deepEqual((await confirmed.json()).data,committed);assert.equal(uploadCount,1);assert.equal(keys.length,2);assert.ok(keys[0]);assert.equal(keys[0],keys[1]);
  await page.getByRole('dialog').waitFor({state:'hidden'});
  const headers={authorization:(await uploaded.request().allHeaders()).authorization};
  const read=await page.request.get(`http://localhost:3300/api/v1/roster-imports/${source.id}/confirmation`,{headers});
  assert.equal(read.status(),200);const stored=(await read.json()).data;
  assert.equal(stored.sourceSha256,createHash('sha256').update(bytes).digest('hex'));
  assert.equal(stored.sourceRows.length,2);assert.deepEqual(stored.sourceRows.map(row=>row.studentNumber),rows.slice(1).map(row=>row[0]));
  if(duplicates){
    assert.ok(stored.sourceRows.every(row=>row.validationStatus==='DUPLICATED'));
    const preview=await page.request.get(`http://localhost:3300/api/v1/roster-imports/${source.id}/registration-preview`,{headers});
    assert.equal(preview.status(),200);const registration=(await preview.json()).data;
    assert.equal(registration.denominator,null);assert.equal(registration.denominatorConfirmed,false);assert.equal(registration.registrationComplete,false);
  }
  stage='RELOAD';await page.reload();
  await page.locator('.teacher-course-card').filter({hasText:name}).getByRole('button',{name:'名单对齐',exact:true}).click();
  await page.getByText('当前名单版本',{exact:true}).waitFor();
  if(process.env.V81_ROSTER_RECONCILE==='1'){
    stage='RECONCILE';
    const runPromise=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/v1/roster-imports/${source.id}/align`&&response.request().method()==='POST');
    await page.getByRole('button',{name:'运行核对',exact:true}).click();
    const run=await runPromise;assert.equal(run.status(),202);
    stage='RECONCILE_ROWS';const row=page.locator('tbody tr').filter({hasText:'000001'});await row.waitFor();
    await row.getByText(duplicates?'重复记录':'未加入课程',{exact:true}).waitFor();
    if(duplicates)await page.getByRole('button',{name:'官方名单总人数 核对中'}).waitFor();
    stage='OPEN_DISCREPANCY';await row.locator('.roster-student-link').click();
    const drawer=page.getByRole('dialog');
    stage='FILL_REASON';await drawer.locator('textarea').fill('Synthetic teacher confirms the registration discrepancy');
    const confirmPromise=page.waitForResponse(response=>/\/roster-alignment-results\/[^/]+\/confirm$/.test(new URL(response.url()).pathname)&&response.request().method()==='POST');
    stage='CONFIRM_DISCREPANCY';await drawer.getByRole('button',{name:'确认该异常',exact:true}).click();
    const confirmation=await confirmPromise;assert.equal(confirmation.status(),200);
    assert.equal((await confirmation.json()).data.resolutionStatus,'CONFIRMED');
    stage='CLOSE_DISCREPANCY';await drawer.getByRole('button',{name:'关闭',exact:true}).click();
    await row.getByText('已确认',{exact:true}).waitFor();
    await row.getByText(duplicates?'重复记录':'未加入课程',{exact:true}).waitFor();
    if(duplicates){
      await page.getByRole('button',{name:'官方名单总人数 核对中'}).waitFor();
      assert.ok((await row.innerText()).includes('2（Synthetic Roster One）'));
      assert.ok((await row.innerText()).includes('3（Synthetic Roster Two）'));
      console.log(JSON.stringify({check:'DUPLICATE_SOURCE_ROWS_PRESERVED_DENOMINATOR_UNCONFIRMED_AFTER_TEACHER_CONFIRM',result:'PASS'}));
    }
    console.log(JSON.stringify({check:'TEACHER_BROWSER_ROSTER_ALIGN_CONFIRM_DISCREPANCY_PRESERVES_UNREGISTERED_STATUS',result:'PASS'}));
  }
  console.log(JSON.stringify({check:'TEACHER_BROWSER_ORIGINAL_ROSTER_CONFIRM_LOST_RESPONSE_SINGLE_SOURCE_RELOAD',result:'PASS',format,classSectionId:course.id,rosterImportId:source.id}));
}catch(error){console.error(JSON.stringify({check:'TEACHER_BROWSER_ROSTER_WRITE',result:'FAIL',format,stage,type:error.name,message:error.message,failures}));process.exitCode=1;}
finally{await browser.close();}
