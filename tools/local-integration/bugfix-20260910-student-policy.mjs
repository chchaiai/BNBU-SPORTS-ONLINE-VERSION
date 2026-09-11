import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const {email}=JSON.parse(fs.readFileSync('.local/v81-browser-state/new-student-join.json'));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(60000);
try{
 await page.goto('http://127.0.0.1:4274/student/');await page.getByRole('button',{name:'同意并继续'}).click();await page.getByText('直接登录',{exact:true}).click();await page.getByText('邮箱验证码登录',{exact:true}).click();await page.getByPlaceholder('name@bnbu.edu.cn').fill(email);
 const before=await(await fetch('http://127.0.0.1:18025/api/v1/messages?limit=100')).json();const ids=new Set(before.messages.map(item=>item.ID));
 await page.getByRole('button',{name:'获取验证码',exact:true}).click();let code;
 for(let attempt=0;attempt<30&&!code;attempt++){
  const messages=await(await fetch('http://127.0.0.1:18025/api/v1/messages?limit=100')).json();const message=messages.messages.find(item=>!ids.has(item.ID)&&JSON.stringify(item.To??[]).includes(email));
  if(message){const mail=await(await fetch(`http://127.0.0.1:18025/api/v1/message/${message.ID}`)).json();code=mail.Text?.match(/\b\d{6}\b/)?.[0];}
  if(!code)await new Promise(resolve=>setTimeout(resolve,500));
 }
 assert.ok(code);await page.getByPlaceholder('4–10 位数字').fill(code);await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.locator('[data-action="guide.skip"]').waitFor();await page.locator('[data-action="guide.skip"]').click();
 await page.locator('[data-action="root.tab"][data-tab="checkin"]').click();
 await page.getByTestId('checkin.minimum-duration').getByText('教师设置的最短运动时长：45 分钟',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:/分钟门槛|分钟封顶/}).count(),0);
 await page.screenshot({path:'.local/bugfix-evidence/student-teacher-minimum-45.png',fullPage:true});
 await page.locator('[data-action="root.tab"][data-tab="grades"]').click();await page.locator('.headline-small').getByText('记录与进度',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:/换算分|等级|排名/}).count(),0);
 await page.screenshot({path:'.local/bugfix-evidence/student-progress-without-score-button.png',fullPage:true});
 console.log(JSON.stringify({check:'STUDENT_TEACHER_CONFIGURED_45_MINUTES_READONLY_NO_SCORE_BUTTON',result:'PASS'}));
}catch(error){await page.screenshot({path:'.local/bugfix-evidence/student-policy-failure.png',fullPage:true});throw error;}finally{await browser.close();}
