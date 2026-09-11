import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const state=JSON.parse(fs.readFileSync(new URL('../../.local/v81-browser-state/state.json',import.meta.url)));
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

  stage='HELP';
  await page.reload();
  await page.getByText('运动指引',{exact:true}).waitFor();
  await page.getByRole('button',{name:'跳过',exact:true}).click();
  await page.getByText('我的',{exact:true}).click();
  await page.locator('[data-action="profile.openSettings"]').click();
  const responsePromise=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/v1/student/help-articles').catch(error=>error);
  await page.locator('[data-action="profile.openHelp"]').click();
  const response=await responsePromise;if(response instanceof Error)throw response;assert.equal(response.status(),200);
  const articles=(await response.json()).data;
  const target=articles.find(article=>process.env.STUDENT_HELP_TITLE ? article.title===process.env.STUDENT_HELP_TITLE : article.title.startsWith('Synthetic Help '));assert.ok(target,'No synthetic published help');
  await page.getByText(target.title,{exact:true}).click();
  await page.getByText(target.bodyMarkdown,{exact:true}).waitFor();
  assert.equal(await page.locator('script[data-help-unsafe],img[onerror],svg[onload]').count(),0);
  if(process.env.STUDENT_HELP_LIFECYCLE==='1') {
    stage='ADMIN_TRANSITION';
    const adminRequest=async(path,token,body)=>{
      const response=await fetch('http://127.0.0.1:3199/api/v1'+path,{method:body?'POST':'GET',headers:{
        ...(token?{authorization:`Bearer ${token}`} : {}),'content-type':'application/json','idempotency-key':randomUUID()},
        ...(body?{body:JSON.stringify(body)}:{})});
      assert.ok(response.ok,`${path}: HTTP ${response.status}`);return (await response.json()).data;
    };
    const login=await adminRequest('/auth/password-login',null,{account:state.accounts.admin.email,password:state.accounts.admin.password});
    let current=await adminRequest('/admin/help-articles/'+target.id,login.accessToken);
    const transition=async(status)=>{
      const {id,version,updatedAt,...content}=current;
      current=await adminRequest('/admin/help-articles/'+id,login.accessToken,{...content,status,expectedVersion:version});
    };
    const reopen=async()=>{
      await page.locator('[data-action="support.back"]').click();
      const responsePromise=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/v1/student/help-articles').catch(error=>error);
      await page.locator('[data-action="profile.openHelp"]').click();
      const response=await responsePromise;if(response instanceof Error)throw response;assert.equal(response.status(),200);
      return (await response.json()).data;
    };
    try {
      await transition('archived');stage='STUDENT_HIDDEN';
      assert.equal((await reopen()).some(article=>article.id===target.id),false);
      await page.getByText(target.title,{exact:true}).waitFor({state:'hidden'});
      await transition('published');stage='STUDENT_REPUBLISHED';
      assert.ok((await reopen()).some(article=>article.id===target.id));
      await page.getByText(target.title,{exact:true}).click();
      await page.getByText(target.bodyMarkdown,{exact:true}).waitFor();
      console.log(JSON.stringify({check:'STUDENT_HELP_PAGE_ADMIN_ARCHIVE_REPUBLISH_REENTER_CACHE_REFRESH',result:'PASS'}));
    } finally {
      if(current.status==='archived')await transition('published');
    }
  }
  if(process.env.STUDENT_HELP_OFFLINE==='1') {
    stage='HELP_NETWORK_FAILURE';
    await page.locator('[data-action="support.back"]').click();
    await page.route('**/api/v1/student/help-articles?*',route=>route.abort('internetdisconnected'));
    const failed=page.waitForEvent('requestfailed',{predicate:request=>new URL(request.url()).pathname==='/api/v1/student/help-articles'}).catch(error=>error);
    await page.locator('[data-action="profile.openHelp"]').click();
    const failedResult=await failed;if(failedResult instanceof Error)throw failedResult;
    await page.getByText('当前正在显示最近缓存的帮助内容。',{exact:true}).waitFor();
    await page.getByText(target.title,{exact:true}).click();
    await page.getByText(target.bodyMarkdown,{exact:true}).waitFor();
    await page.screenshot({path:'.local/v81-browser-state/student-help-offline-current.png',fullPage:true});
    stage='HELP_NETWORK_RECOVERY';
    await page.locator('[data-action="support.back"]').click();
    await page.unroute('**/api/v1/student/help-articles?*');
    const online=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/v1/student/help-articles'&&response.status()===200).catch(error=>error);
    await page.locator('[data-action="profile.openHelp"]').click();
    const onlineResult=await online;if(onlineResult instanceof Error)throw onlineResult;
    await page.getByText('当前正在显示最近缓存的帮助内容。',{exact:true}).waitFor({state:'hidden'});
    await page.getByText(target.title,{exact:true}).click();
    await page.getByText(target.bodyMarkdown,{exact:true}).waitFor();
    console.log(JSON.stringify({check:'STUDENT_HELP_FAILED_NETWORK_OWN_CACHE_LABEL_RECOVERY_SERVER_READ',result:'PASS'}));
  }
  if(process.env.STUDENT_HELP_ENGLISH==='1') {
    stage='HELP_ENGLISH';
    await page.locator('[data-action="support.back"]').click();
    await page.locator('[data-action="profile.language"][data-value="en"]').click();
    try {
      const english=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/v1/student/help-articles'&&new URL(response.url()).searchParams.get('locale')==='en').catch(error=>error);
      await page.locator('[data-action="profile.openHelp"]').click();
      const response=await english;if(response instanceof Error)throw response;assert.equal(response.status(),200);
      const item=(await response.json()).data.find(article=>article.id===target.id);assert.ok(item);
      assert.notEqual(item.title,target.title);
      await page.getByText(item.title,{exact:true}).click();
      await page.getByText(item.bodyMarkdown,{exact:true}).waitFor();
      await page.screenshot({path:'.local/v81-browser-state/student-help-english-current.png',fullPage:true});
      console.log(JSON.stringify({check:'STUDENT_HELP_LANGUAGE_SWITCH_ENGLISH_SERVER_TITLE_BODY',result:'PASS'}));
    } finally {
      if(await page.locator('[data-action="support.back"]').count())await page.locator('[data-action="support.back"]').click();
      await page.locator('[data-action="profile.language"][data-value="zh"]').click();
    }
    const chinese=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/v1/student/help-articles'&&new URL(response.url()).searchParams.get('locale')==='zh-CN').catch(error=>error);
    await page.locator('[data-action="profile.openHelp"]').click();
    const response=await chinese;if(response instanceof Error)throw response;assert.equal(response.status(),200);
    await page.getByText(target.title,{exact:true}).click();await page.getByText(target.bodyMarkdown,{exact:true}).waitFor();
  }
  await page.screenshot({path:process.env.STUDENT_HELP_SCREENSHOT??'.local/v81-browser-state/student-help-current.png',fullPage:true});
  console.log(JSON.stringify({check:'STUDENT_HELP_SMTP_LOGIN_REAL_LIST_PUBLISHED_ARTICLE_EXPAND_BODY',result:'PASS',publishedCount:articles.length}));
} catch(error){if(diagnosticPage)await diagnosticPage.screenshot({path:process.env.STUDENT_HELP_DIAGNOSTIC??'.local/v81-browser-state/student-help-diagnostic-current.png',fullPage:true});console.log(JSON.stringify({stage,error:error.message}));process.exitCode=1;}
finally{await browser.close();}
