// Read-only legacy public-help boundary. No globally visible test content is published.
import fs from 'node:fs';import assert from 'node:assert/strict';
const checks=[];
for(const path of ['/help-articles?locale=zh-CN','/help-articles?locale=en','/help-articles/00000000-0000-4000-8000-000000000001']){
 const r=await fetch('https://www.student.bnbusports.cn/api/v1'+path,{signal:AbortSignal.timeout(20000)});const v=await r.json();
 const expected=path.includes('?')?200:404;assert.equal(r.status,expected);
 checks.push({path,status:r.status,code:v.code??null,data:v.data??null});
}
const result={observedAt:new Date().toISOString(),checks,result:'READ_BOUNDARIES_PASS',successfulDetail:'PENDING_NO_PUBLISHED_PUBLIC_ARTICLE',currentStudentPage:'/student/help-articles',currentPageEvidence:'student-help-browser.json',scope:'Legacy public list and nonexistent detail only; not successful article detail'};
fs.writeFileSync('evidence/ocr-triplatform-20260913/public-help-boundary.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
