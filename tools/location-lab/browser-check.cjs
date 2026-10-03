const {chromium}=require('../../.local/browser-test/node_modules/playwright-core');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
const server=http.createServer((req,res)=>{let name=req.url==='/'?'index.html':req.url.slice(1);if(!['index.html','style.css','app.js','fingerprint.js'].includes(name)){res.writeHead(404).end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(path.join(__dirname,'web',name)));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const url=process.env.LOCATION_LAB_URL||`http://127.0.0.1:${server.address().port}`;
 fs.mkdirSync(path.join(__dirname,'qa'),{recursive:true});
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:900},permissions:['geolocation'],geolocation:{latitude:22.35,longitude:113.53,accuracy:15}});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.locator('#scan').click();await page.waitForFunction(()=>document.querySelector('#lat').textContent==='22.3500000');
  assert.equal(await page.locator('#accuracy').textContent(),'± 15.0 米');assert.match(await page.locator('#wifiStatus').textContent(),/不提供/);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(__dirname,`qa/browser-${width}.png`),fullPage:true});assert.deepEqual(errors,[]);await context.close();
 }
 const context=await browser.newContext({viewport:{width:390,height:900}});const page=await context.newPage();await page.addInitScript(()=>window.AndroidCollector={collect(){}});await page.goto(url);
 const deliver=async(values,id)=>page.evaluate(({values,id})=>onNativeWifi({fresh:true,scanId:id,aps:values.map((rssi,i)=>({ssid:'测试 AP',bssid:`aa:bb:cc:dd:ee:0${i}`,rssi})),connectedBssid:'aa:bb:cc:dd:ee:00'}),{values,id});
 for(const [name,values] of [['教室 A',[-40,-55,-66]],['教室 B',[-70,-40,-35]]]){await page.locator('#place').fill(name);for(let i=0;i<3;i++){await deliver(values,name+i);await page.locator('#save').click();}}
 await page.locator('#save').click();assert.match(await page.locator('#result').textContent(),/本次扫描已保存/);
 await deliver([-41,-55,-67],'match');await page.locator('#match').click();assert.match(await page.locator('#result').textContent(),/可能位置：教室 A/);
 await page.screenshot({path:path.join(__dirname,'qa/native-synthetic.png'),fullPage:true});
 await page.reload();assert.equal(await page.locator('#places li').count(),2);
 await page.evaluate(()=>onNativeWifi({fresh:false,aps:[],message:'限频'}));await page.locator('#save').click();assert.match(await page.locator('#result').textContent(),/新扫描/);
 await context.close();
 const denied=await browser.newContext();const p=await denied.newPage();await p.goto(url);await p.locator('#scan').click();await p.waitForFunction(()=>document.querySelector('#gpsStatus').textContent.includes('拒绝'));await denied.close();
 console.log('PASS: desktop/mobile layout, geolocation success/denial, synthetic native rendering, enrollment, matching, persistence, duplicate/stale rejection');
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
