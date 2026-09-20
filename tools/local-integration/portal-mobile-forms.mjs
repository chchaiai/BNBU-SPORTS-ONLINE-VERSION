import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const out='evidence/portal-mobile-20260920';
const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const results=[];
try {for(const role of ['teacher','admin'])for(const height of [700,480]){
 const p=await b.newPage({viewport:{width:390,height}});await p.goto(`http://localhost:53200/?mock=${role}`);await p.locator('.app-shell').waitFor();
 if(role==='admin'){await p.getByRole('button',{name:'菜单',exact:true}).click();await p.locator('.sidebar nav').getByRole('button',{name:'分管理员设置',exact:true}).click();await p.getByRole('button',{name:'新增分管理员',exact:true}).click();}
 else await p.getByRole('button',{name:/新建课程/}).click();
 const modal=p.locator('.modal').last();await modal.waitFor();const bounds=await modal.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=391&&bounds.height<=height);
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.ok(await modal.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+12));}),'Dialog header must not be covered by navigation');
 const footer=modal.locator('.modal-footer');const footerBox=await footer.boundingBox();assert.ok(footerBox.y>=0&&footerBox.y+footerBox.height<=height);
 const body=modal.locator('.teacher-dialog-body,.admin-dialog-body').first();await body.evaluate(e=>e.scrollTop=e.scrollHeight);
 await p.screenshot({path:`${out}/${role}-form-${height}.png`,fullPage:false});
 await p.getByRole('button',{name:'取消',exact:true}).click();assert.equal(await modal.count(),0);
 results.push({role,height,result:'PASS',footerReachable:true});await p.close();
}await fs.writeFile(`${out}/forms.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await b.close();}
