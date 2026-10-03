import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '../../.local/browser-test/node_modules/playwright-core/index.mjs';
const folder='evidence/access-speed-20260928';
const {student:{base}}=JSON.parse(await readFile(folder+'/validation.json'));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://www.student.bnbusports.cn/student/',{waitUntil:'networkidle'});
 const mime=await page.evaluate(async base=>{
  const results=[];
  for(const name of ['vendor/ffmpeg/core/ffmpeg-core.wasm','vendor/pdfjs/legacy/build/pdf.worker.js','js/vendor/jsQR.js']){
   const response=await fetch(base+name,{method:'HEAD'});results.push({name,status:response.status,type:response.headers.get('content-type'),cache:response.headers.get('cache-control')});
  }
  return results;
 },base);
 assert.ok(mime.every(r=>r.status===200&&r.cache.includes('immutable')));
 assert.equal(mime[0].type,'application/wasm');
 const rendered=await page.evaluate(async base=>{
  // In-memory one-page PDF fixture, never uploaded or linked to a real account.
  const stream='BT /F1 18 Tf 20 100 Td (Preview OK) Tj ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let text='%PDF-1.4\n';const offsets=[0];
  for(let i=0;i<objects.length;i++){offsets.push(text.length);text+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
  const xref=text.length;text+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const {openMaterialPreview}=await import(base+'js/material-preview.js');
  await openMaterialPreview({file:new File([text],'fixture.pdf',{type:'application/pdf'}),name:'fixture.pdf'});
  const canvas=document.querySelector('.material-preview canvas');
  const result={width:canvas?.width||0,text:document.querySelector('.material-preview')?.textContent};
  document.querySelector('.material-preview header button')?.click();return result;
 },base);
 assert.ok(rendered.width>0);assert.ok(rendered.text.includes('1 / 1'));assert.deepEqual(errors,[]);
 const result={result:'PASS',mime,pdfWorkerRendered:true,errors,businessDataWrites:0};
 await writeFile(folder+'/media-path-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
