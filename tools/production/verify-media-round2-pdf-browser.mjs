import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--no-proxy-server','--host-resolver-rules=MAP www.student.bnbusports.cn 43.129.193.7']});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://www.student.bnbusports.cn/student/');
 const bytes=[...fs.readFileSync('.local/v81-browser-state/demand-proof.pdf')];
 await page.evaluate(async bytes=>{const {openMaterialPreview}=await import('/student/js/material-preview.js');await openMaterialPreview({file:new File([new Uint8Array(bytes)],'Synthetic.pdf',{type:'application/pdf'}),name:'Synthetic PDF',mime:'application/pdf'});},bytes);
 await page.waitForFunction(()=>document.querySelector('.material-preview nav span')?.textContent==='1 / 1');assert.deepEqual(errors,[]);
 await page.screenshot({path:'docs/implementation/evidence/media-round2-20260912/cloud-pdf-preview.png'});
 console.log(JSON.stringify({check:'CLOUD_PDF_JS_WORKER_CANVAS_PREVIEW',result:'PASS',errors}));
}finally{await browser.close();}
