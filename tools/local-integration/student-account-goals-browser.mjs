import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const root=resolve('.local/student-account-goals/student'),overlay=resolve('.local/student-account-goals/bundle/web/student');
const server=createServer(async(req,res)=>{try{
 const path=decodeURIComponent(new URL(req.url,'http://local').pathname);
 if(path==='/fixture'){res.setHeader('Content-Type','text/html');res.end('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/tokens.css"><link rel="stylesheet" href="/css/components.css"><link rel="stylesheet" href="/css/screens.css"></head><body><main id="view"></main></body></html>');return}
 const file=resolve(root,'.'+path);assert.ok(file.startsWith(root));let data;try{data=await readFile(resolve(overlay,'.'+path))}catch{data=await readFile(file)}
 res.setHeader('Content-Type',extname(file)==='.js'?'text/javascript':extname(file)==='.css'?'text/css':'text/plain');res.end(data);
}catch{res.statusCode=404;res.end()}});
await new Promise(r=>server.listen(53293,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto('http://127.0.0.1:53293/fixture');
await page.evaluate(async()=>{
 const {buildLocalPreviewWorkspace}=await import('/js/local-preview.js');
 const checkin=await import('/js/screens/checkin.js'),profile=await import('/js/screens/profile.js');
 const app={state:{workspace:buildLocalPreviewWorkspace()},ui:{},overlay:{healthReminderAck:true},
 hasActiveEnrollment:()=>true,isApiMode:()=>false,isLocalPreview:()=>true,isWriteAllowed:()=>true,saveOverlay(){},
 showDialog(dialog){this.dialog=dialog},openSub(screen){this.screen=screen;this.render()},closeSub(){},
 render(){document.querySelector('#view').innerHTML=this.screen==='accountDeletion'?profile.renderAccountDeletion(this):checkin.renderCheckIn(this)},
 };
 document.addEventListener('click',e=>{const el=e.target.closest('[data-action]');if(el&&!el.disabled)(checkin.checkinActions[el.dataset.action]||profile.profileActions[el.dataset.action])?.(app,el)});
 window.fixture={app,checkin,profile};
 app.state.workspace.hourRule.courseRequired=0;app.state.workspace.hourRule.generalRequired=20;app.render();
});
const category=value=>page.locator(`[data-action="checkin.creditType"][data-value="${value}"]`);
assert.equal(await category('course').isDisabled(),true);assert.equal(await category('general').isDisabled(),false);
assert.equal(await category('course').evaluate(el=>getComputedStyle(el).opacity),'0.45');
await page.screenshot({path:'evidence/student-account-goals-20260920/zero-course-mobile.png',fullPage:true});
await page.evaluate(()=>{const {app,checkin}=fixture;checkin.checkinActions['checkin.creditType'](app,{dataset:{value:'course'}});if(app.ui.checkin.setup.creditType!=='general')throw Error('locked category selected');app.ui.checkin.setup.creditType='course';checkin.checkinActions['checkin.start'](app);if(app.dialog)throw Error('locked start bypass');});
await page.evaluate(()=>{const a=fixture.app;a.state.workspace.hourRule={courseRequired:20,generalRequired:0};a.render()});
assert.equal(await category('general').isDisabled(),true);assert.equal(await category('course').isDisabled(),false);
await page.evaluate(()=>{const a=fixture.app;a.state.workspace.hourRule={courseRequired:0,generalRequired:0};a.render()});
assert.equal(await category('course').isDisabled(),true);assert.equal(await category('general').isDisabled(),true);assert.equal(await page.locator('[data-action="checkin.start"]').isDisabled(),true);
await page.evaluate(()=>{const a=fixture.app;a.state.workspace.hourRule={courseRequired:null,generalRequired:null};a.render()});
assert.equal(await category('course').isDisabled(),false);assert.equal(await category('general').isDisabled(),false);
await page.evaluate(()=>fixture.profile.profileActions['profile.openAccountDeletion'](fixture.app));
await page.locator('[data-action="profile.accountDeletionRequestConfirm"]').click();
assert.equal(await page.evaluate(()=>fixture.app.dialog.buttons.at(-1).action),'profile.accountDeletionRequest');
await page.evaluate(()=>{const a=fixture.app;a.ui.accountDeletion={challengeId:'550e8400-e29b-41d4-a716-446655440000',challengeVersion:2,code:'123456',expiresAt:new Date(Date.now()+600000).toISOString(),busy:false};a.render()});
await page.locator('[data-action="profile.accountDeletionFinalConfirm"]').click();
assert.equal(await page.evaluate(()=>fixture.app.dialog.buttons.at(-1).action),'profile.accountDeletionFinalize');
assert.ok((await page.locator('#view').innerText()).includes('历史运动记录'));
await page.screenshot({path:'evidence/student-account-goals-20260920/deletion-mobile.png',fullPage:true});
console.log(JSON.stringify({result:'PASS',scenarios:7,mobileViewport:'390x844',realBrowser:'Edge',scope:'UI rendering and actions; HTTP/SMTP deletion separately verified'}));
}finally{await browser.close();await new Promise(r=>server.close(r))}
