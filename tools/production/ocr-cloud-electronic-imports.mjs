// Real COS-backed CSV roster and XLSX physical import using one synthetic student.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),xlsx=require('../../backend/node_modules/xlsx');
const staff=JSON.parse(fs.readFileSync('.local/ocr-triplatform-20260913-private.json')),beta=JSON.parse(fs.readFileSync('.local/ocr-beta-private.json')),fixture=JSON.parse(fs.readFileSync('.local/ocr-beta-course.json')),checks=[];let roster,physical;
const t=staff.teacherToken,s=beta.session.accessToken;
async function api(path,token,body,status=body?201:200,key=randomUUID()){
 const form=body instanceof FormData,r=await fetch('https://www.teacher.bnbusports.cn/api/v1'+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,'idempotency-key':key,...(form?{}:{'content-type':'application/json'})},...(body?{body:form?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});const v=await r.json();assert.equal(r.status,status,JSON.stringify({path,status:r.status,code:v.code}));return v.data;
}
try{
 assert.match((await api(`/class-sections/${fixture.sectionId}`,t)).displayName,/^Synthetic electronic/);
 if(process.argv.includes('--resume-physical')){const prior=JSON.parse(fs.readFileSync('evidence/ocr-triplatform-20260913/cloud-electronic-imports-cos-denied.json'));assert.equal(prior.sectionId,fixture.sectionId);roster={id:prior.rosterImportId};checks.push(...prior.checks);}else{
 const csv=`studentNumber,fullName,gender,gradeYear\n${fixture.studentNumber},${fixture.fullName},${fixture.gender},${fixture.gradeYear}\n`,bytes=Buffer.from(csv);
 const form=new FormData();form.set('source','FILE');form.set('fileFormat','CSV');form.set('fieldMappingSnapshot',JSON.stringify({studentNumber:'studentNumber',fullName:'fullName',gender:'gender',gradeYear:'gradeYear',collegeName:null,majorName:null,administrativeClassName:null}));form.set('file',new Blob([bytes],{type:'text/csv'}),'synthetic-electronic-roster.csv');
 const uploadKey=randomUUID();roster=await api(`/class-sections/${fixture.sectionId}/roster-imports`,t,form,201,uploadKey);assert.deepEqual(await api(`/class-sections/${fixture.sectionId}/roster-imports`,t,form,201,uploadKey),roster);
 const path=`/roster-imports/${roster.id}`,source=await api(path+'/source',t);assert.equal(source.sourceSha256,createHash('sha256').update(bytes).digest('hex'));assert.ok(Buffer.from(source.fileBase64,'base64').equals(bytes));await api(path+'/source',s,undefined,403);
 checks.push('CSV_ROSTER_COS_BYTES_AND_UPLOAD_REPLAY_STUDENT_SOURCE_DENIED');
 const key=randomUUID(),input={expectedVersion:roster.version},confirmed=await api(path+'/confirmation',t,input,201,key);assert.deepEqual(await api(path+'/confirmation',t,input,201,key),confirmed);assert.equal((await api(path+'/confirmation',t)).sourceSha256,source.sourceSha256);
 await api(path+'/align',t,{expectedRosterImportVersion:roster.version},202);
 for(const suffix of ['', '/entries','/registration-preview'])await api(path+suffix,t);
 const aligned=await api(`/roster-alignment-results?classSectionId=${fixture.sectionId}&currentOnly=true&limit=100`,t);assert.ok(aligned.some(row=>row.status==='MATCHED'));
 await api(`/roster-alignment-results/${aligned[0].id}`,t);
 assert.equal((await api(`/enrollments/${fixture.enrollmentId}/roster-status`,s)).status,'MATCHED');checks.push('ELECTRONIC_CONFIRM_ALIGN_DETAIL_STUDENT_MATCH');
 }
 const book=xlsx.utils.book_new();xlsx.utils.book_append_sheet(book,xlsx.utils.aoa_to_sheet([['Ignored sheet']]),'Notes');xlsx.utils.book_append_sheet(book,xlsx.utils.aoa_to_sheet([['学号','姓名','项目','用时','测试日期'],[fixture.studentNumber,fixture.fullName,'1000m','5:10','2026-09-12']]),'体测');const file=xlsx.write(book,{type:'buffer',bookType:'xlsx'}),payload={sheetName:'体测',fileBase64:file.toString('base64')},physicalKey=randomUUID();
 physical=await api(`/class-sections/${fixture.sectionId}/physical-imports/xlsx`,t,payload,201,physicalKey);assert.deepEqual(await api(`/class-sections/${fixture.sectionId}/physical-imports/xlsx`,t,payload,201,physicalKey),physical);assert.equal(physical.rows[0].elapsedSeconds,310);assert.equal(physical.rows[0].enrollmentId,fixture.enrollmentId);
 const pp=`/physical-imports/${physical.id}`,original=await api(pp+'/source',t);assert.ok(Buffer.from(original.fileBase64,'base64').equals(file));
 const priorPhysical=await api(`/enrollments/${fixture.enrollmentId}/physical-results`,t);
 const confirmInput={selections:[{rowNumber:1,expectedVersion:physical.rows[0].version,expectedResultVersion:priorPhysical.items[0]?.version??0}]},confirmKey=randomUUID(),accepted=await api(pp+'/confirm',t,confirmInput,201,confirmKey);assert.equal(accepted.pendingCount,0);assert.deepEqual(await api(pp+'/confirm',t,confirmInput,201,confirmKey),accepted);
 await api(pp,t);await api(pp+'/revisions?rowNumber=1',t);const result=await api(`/student/enrollments/${fixture.enrollmentId}/physical-result`,s);assert.equal(result.result.elapsedSeconds,310);assert.equal(result.result.runType,'1000m');checks.push('XLSX_SELECTED_SHEET_COS_SOURCE_CONFIRM_REPLAY_STUDENT_RESULT');
 const exported=await api(`/class-sections/${fixture.sectionId}/composite-roster/export`,t);assert.ok(Buffer.from(exported.fileBase64,'base64').length>0);checks.push('COMPOSITE_ROSTER_EXPORT');
}finally{const result={check:'CLOUD_ELECTRONIC_IMPORTS',observedAt:new Date().toISOString(),organizationId:fixture.organizationId,sectionId:fixture.sectionId,rosterImportId:roster?.id,physicalImportId:physical?.id,checks,allChecksCompleted:checks.includes('COMPOSITE_ROSTER_EXPORT')};fs.writeFileSync('evidence/ocr-triplatform-20260913/cloud-electronic-imports.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
