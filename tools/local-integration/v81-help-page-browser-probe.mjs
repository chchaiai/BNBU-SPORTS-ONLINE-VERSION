import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(fs.readFileSync(new URL('../../.local/v81-browser-state/state.json',import.meta.url)));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
let stage='LOGIN';
try {
  const page=await browser.newPage();page.setDefaultTimeout(20000);
  await page.goto('http://localhost:3300/');
  await page.getByLabel('学校邮箱').fill(state.accounts.admin.email);
  await page.locator('#login-password').fill(state.accounts.admin.password);
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.getByRole('button',{name:'帮助中心',exact:true}).click();
  stage='CREATE';await page.getByRole('button',{name:'新建帮助文章',exact:true}).click();
  const dialog=page.getByRole('dialog'),name='Synthetic Help '+randomUUID();
  const unsafe='<script>window.__helpUnsafe=1</script>\n<img src=x onerror="window.__helpUnsafe=1">\n<svg onload="window.__helpUnsafe=1"></svg>\n[bad](javascript:window.__helpUnsafe=1)\n[data](data:text/html,test)\n[good](https://example.invalid/help)\n**正常加粗**';
  await dialog.locator('input').nth(0).fill(name);await dialog.locator('input').nth(1).fill(name+' EN');
  await dialog.locator('textarea').nth(0).fill('合成帮助正文');await dialog.locator('textarea').nth(1).fill('Synthetic help body');
  if(process.env.HELP_CONTENT_SAFETY==='1') {
    await dialog.locator('textarea').nth(0).fill(unsafe);
    const preview=dialog.locator('.help-article-markdown');
    assert.equal(await preview.locator('script,img,svg,iframe,[onerror],[onload]').count(),0);
    assert.equal(await preview.locator('a').count(),1);
    assert.equal(await preview.locator('a').getAttribute('rel'),'noreferrer noopener');
  }
  await dialog.locator('input').nth(2).fill('test');
  let lose=true;const keys=[];
  await page.route('**/api/v1/admin/help-articles',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    keys.push(route.request().headers()['idempotency-key']);const response=await route.fetch();
    if(lose&&response.ok()){lose=false;return route.abort('failed');}
    await route.fulfill({response});
  });
  await dialog.getByRole('button',{name:'保存草稿',exact:true}).click();
  await dialog.getByRole('alert').waitFor();stage='RETRY';
  assert.equal(await dialog.locator('input').nth(0).isDisabled(),true);
  assert.equal(await dialog.getByRole('button',{name:'取消',exact:true}).isDisabled(),true);
  if(process.env.HELP_REFRESH_RECOVERY==='1') {
    await page.reload();await page.getByRole('button',{name:'帮助中心',exact:true}).click();
    await dialog.getByText('已恢复未确认的提交，请按原内容重试。',{exact:true}).waitFor();
    assert.equal(await dialog.locator('input').nth(0).inputValue(),name);
    assert.equal(await dialog.locator('input').nth(0).isDisabled(),true);
    assert.equal(await dialog.getByRole('button',{name:'保存并发布',exact:true}).isDisabled(),true);
  }
  await dialog.getByRole('button',{name:'保存草稿',exact:true}).click();
  await dialog.waitFor({state:'hidden'});assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);
  assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.startsWith('bnbu-help-pending-v1:')).length),0);
  await page.locator('input[type=search]').fill(name);
  const row=page.locator('article.admin-help-article').filter({hasText:name});await row.waitFor();
  if(process.env.HELP_CONTENT_SAFETY==='1') {
    assert.equal(await row.locator('script,img,svg,iframe,[onerror],[onload]').count(),0);
    assert.ok((await row.innerText()).includes('<script>window.__helpUnsafe=1</script>'));
    assert.equal(await page.evaluate(()=>window.__helpUnsafe),undefined);
    const student=await browser.newPage();
    try {
      await student.goto('http://127.0.0.1:4274/student/');
      const result=await student.evaluate(async content=>{
        const {renderHelpMarkdown}=await import('/student/js/help-content.js');
        const host=document.createElement('section');host.innerHTML=renderHelpMarkdown(content);document.body.append(host);
        const links=[...host.querySelectorAll('a')].map(a=>({href:a.getAttribute('href'),rel:a.getAttribute('rel')}));
        return {danger:host.querySelectorAll('script,img,svg,iframe,[onerror],[onload]').length,links,text:host.textContent,executed:window.__helpUnsafe??false};
      },unsafe);
      assert.equal(result.danger,0);assert.equal(result.executed,false);
      assert.deepEqual(result.links,[{href:'https://example.invalid/help',rel:'noreferrer noopener'}]);
      assert.ok(result.text.includes('<script>window.__helpUnsafe=1</script>'));
    } finally {await student.close();}
    console.log(JSON.stringify({check:'HELP_SAVED_ADMIN_PREVIEW_AND_STUDENT_RENDERER_HTML_ESCAPE_LINK_ALLOWLIST',result:'PASS'}));
  }
  let loseTransition=process.env.HELP_TRANSITION_REFRESH==='1';const transitionKeys=[];
  await page.route('**/api/v1/admin/help-articles/*',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    transitionKeys.push(route.request().headers()['idempotency-key']);const response=await route.fetch();
    if(loseTransition&&response.ok()){loseTransition=false;return route.abort('failed');}
    await route.fulfill({response});
  });
  for(const action of ['发布','下线','重新上线']) {
    stage=action;await row.getByRole('button',{name:action,exact:true}).click();
    await dialog.getByRole('button',{name:action==='重新上线'?'发布':action,exact:true}).click();
    if(action==='发布'&&process.env.HELP_TRANSITION_REFRESH==='1') {
      await dialog.getByRole('alert').waitFor();
      await page.reload();await page.getByRole('button',{name:'帮助中心',exact:true}).click();
      await dialog.getByText('已恢复未确认的提交，请按原内容重试。',{exact:true}).waitFor();
      await dialog.getByRole('button',{name:'发布',exact:true}).click();
      await dialog.waitFor({state:'hidden'});
      assert.equal(transitionKeys.length,2);assert.equal(transitionKeys[0],transitionKeys[1]);
      assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.startsWith('bnbu-help-pending-v1:')).length),0);
      await page.locator('input[type=search]').fill(name);
    }
    await dialog.waitFor({state:'hidden'});
    if(process.env.HELP_CONTENT_SAFETY==='1'&&action==='发布') {
      assert.equal(await row.locator('script,img,svg,iframe,[onerror],[onload]').count(),0);
      assert.ok((await row.innerText()).includes('<script>window.__helpUnsafe=1</script>'));
      assert.equal(await row.locator('a').getAttribute('href'),'https://example.invalid/help');
      assert.equal(await page.evaluate(()=>window.__helpUnsafe),undefined);
      console.log(JSON.stringify({check:'HELP_PUBLISHED_ADMIN_CONTENT_REMAINS_ESCAPED',result:'PASS'}));
    }
  }
  stage='EDIT';await row.getByRole('button',{name:'编辑',exact:true}).click();
  await dialog.locator('textarea').nth(0).fill('合成帮助正文已更新');
  await dialog.getByRole('button',{name:'保存',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await row.getByText('合成帮助正文已更新',{exact:true}).waitFor();
  if(process.env.HELP_CONFLICT==='1') {
    stage='CONFLICT';let raced=false;const statuses=[];
    await page.route('**/api/v1/admin/help-articles/*',async route=>{
      if(route.request().method()!=='POST'||raced)return route.continue();
      raced=true;
      const input=route.request().postDataJSON();
      const concurrent=await route.fetch({headers:{...route.request().headers(),'idempotency-key':randomUUID()},
        postData:JSON.stringify({...input,bodyZh:'其他编辑者已保存'})});
      assert.equal(concurrent.status(),201);
      const original=await route.fetch();statuses.push(original.status());await route.fulfill({response:original});
    });
    await row.getByRole('button',{name:'编辑',exact:true}).click();
    await dialog.locator('textarea').nth(0).fill('旧编辑框的内容');
    await dialog.getByRole('button',{name:'保存',exact:true}).click();
    await dialog.getByRole('alert').waitFor();assert.deepEqual(statuses,[409]);
    assert.equal(await dialog.locator('textarea').nth(0).inputValue(),'旧编辑框的内容');
    assert.equal(await dialog.locator('textarea').nth(0).isDisabled(),false);
    assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.startsWith('bnbu-help-pending-v1:')).length),0);
    await dialog.getByRole('button',{name:'取消',exact:true}).click();await dialog.waitFor({state:'hidden'});
    await row.getByText('其他编辑者已保存',{exact:true}).waitFor();
    await row.getByRole('button',{name:'编辑',exact:true}).click();
    assert.equal(await dialog.locator('textarea').nth(0).inputValue(),'其他编辑者已保存');
    await dialog.locator('textarea').nth(0).fill('重新核对后保存');
    await dialog.getByRole('button',{name:'保存',exact:true}).click();await dialog.waitFor({state:'hidden'});
    await row.getByText('重新核对后保存',{exact:true}).waitFor();
    console.log(JSON.stringify({check:'HELP_PAGE_CONCURRENT_EDIT_409_PRESERVE_INPUT_RELOAD_REOPEN_SAVE',result:'PASS'}));
  }
  await page.screenshot({path:process.env.HELP_SCREENSHOT_PATH??'.local/v81-browser-state/help-page-current.png',fullPage:true});
  console.log(JSON.stringify({check:'HELP_PAGE_CREATE_LOST_RESPONSE_RETRY_PUBLISH_ARCHIVE_REPUBLISH_EDIT',result:'PASS'}));
} catch(error){console.log(JSON.stringify({stage,error:error.message}));process.exitCode=1;}
finally{await browser.close();}
