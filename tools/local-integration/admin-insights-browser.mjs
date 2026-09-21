import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const out='evidence/admin-analytics-20260921';
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const record={id:'record',studentId:'student',studentName:'合成学生',studentNumber:'S001',className:'高尔夫(Wed)1004',businessDate:'2026-09-21',startedAt:'2026-09-21T01:02:03Z',endedAt:'2026-09-21T02:02:04Z',submittedAt:'2026-09-21T02:05:06Z',sportName:'高尔夫',sportType:'OTHER',actualDurationSeconds:3601,creditedDurationSeconds:3600,workflowStage:'VALID',currentReview:{result:'VALID',publicComment:'符合要求'}};
 let teacher={id:'teacher',fullName:'合成教师',remark:'原备注',version:1},lastList='';
 await page.route('**/api/v1/**',async route=>{const url=new URL(route.request().url()),path=url.pathname;let data={},meta={};
 if(path.endsWith('/admin/insights'))data={generatedAt:'2026-09-21T03:04:05Z',from:'2026-09-01',to:'2026-09-21',summary:{records:56,students:12,seconds:201600,credited:180000},daily:[{label:'2026-09-20',value:20},{label:'2026-09-21',value:36}],sports:[{label:'高尔夫',value:36},{label:'RUNNING',value:20}],stages:[{label:'VALID',value:50},{label:'PENDING_TEACHER',value:6}],frequency:[{label:'2',value:5},{label:'4',value:7}],classes:[{label:record.className,value:56}],teachers:[{label:'合成教师',value:50}],heatmap:[{weekday:1,hour:9,value:36},{weekday:7,hour:18,value:20}]};
 else if(path.endsWith('/admin/course-directory'))data={rows:[{id:'class',courseName:record.className}]};
 else if(path.endsWith('/exercise-records')){lastList=url.search;data=[record];meta={pagination:{total:56,totalPages:3,limit:25,hasMore:false,nextCursor:null}};}
 else if(path.endsWith('/evidence-context'))data={mediaIds:[]};
 else if(path.endsWith('/students'))data=[{id:'student',fullName:'合成学生',studentNumber:'S001'}];
 else if(path.endsWith('/details')){if(route.request().method()==='PATCH'){const body=route.request().postDataJSON();teacher={...teacher,...body,version:2};}data=teacher;}
 await route.fulfill({json:{data,meta}});
 });
 await page.goto('http://127.0.0.1:53300/insights-qa-local');
 await page.getByRole('heading',{name:'运动与教学数据看板'}).waitFor();
 await page.getByText('第 1 / 3 页 · 共 56 条 · 每页 25 条').waitFor();
 assert.ok(await page.getByText(/09:02:03/).count());
 await page.getByRole('button',{name:'末页',exact:true}).click();await page.getByText('第 3 / 3 页 · 共 56 条 · 每页 25 条').waitFor();assert.match(lastList,/page=3/);
 await page.locator('.admin-checkins').getByRole('combobox').nth(1).selectOption('VALID');await page.getByText('第 1 / 3 页 · 共 56 条 · 每页 25 条').waitFor();assert.match(lastList,/workflowStage=VALID/);
 await page.getByRole('button',{name:'凭证相册',exact:true}).click();await page.locator('.admin-record-albums article').waitFor();
 const form=page.locator('form').filter({has:page.getByRole('heading',{name:'编辑教师资料'})});await form.getByRole('textbox').first().fill('已修改教师');await form.getByRole('textbox').nth(1).fill('审核协作备注');await form.getByRole('button',{name:'保存姓名和备注'}).click();await page.getByText('已保存。',{exact:true}).waitFor();assert.equal(teacher.fullName,'已修改教师');
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'导出完整数据 CSV'}).click();const download=await downloadPromise;await download.saveAs(out+'/synthetic-chart-data.csv');
 await page.screenshot({path:out+'/dashboard-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'查看打卡记录 →',exact:true}).click();await page.getByRole('button',{name:'← 返回班级学生'}).waitFor();assert.match(lastList,/studentId=student/);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'mobile document must not overflow horizontally');await page.screenshot({path:out+'/dashboard-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',checks:8,scope:'Synthetic browser fixtures: charts, exports, pagination, filters, album, teacher edits, student drilldown, responsive layout'}));
}finally{await browser.close();}
