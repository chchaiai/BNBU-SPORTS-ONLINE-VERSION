import 'reflect-metadata';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { utils, write } from 'xlsx';
import { RosterMultipartUploadService } from './dist/common/roster-ingestion/roster-multipart-upload.service.js';
import { RosterCsvParserService } from './dist/common/roster-ingestion/roster-csv-parser.service.js';
const objects = new Map();
const storage = {async putPrivateObject({storageKey,body}) {const chunks=[];for await(const c of body)chunks.push(c);objects.set(storageKey,Buffer.concat(chunks));return {entityTag:null}},async getPrivateObject(key){return Readable.from([objects.get(key)])},async deletePrivateObject(key){objects.delete(key)}};
for(const extension of ['csv','xlsx','xls']) {
 const book=utils.book_new();utils.book_append_sheet(book,utils.aoa_to_sheet([['学号','姓名'],['000123','测试学生']]),'名单');
 const bytes=write(book,{type:'buffer',bookType:extension});const format=extension.toUpperCase();
 const form=new FormData();form.set('source','FILE');form.set('fileFormat',format);form.set('fieldMappingSnapshot',JSON.stringify({studentNumber:'学号',fullName:'姓名'}));if(extension!=='csv')form.set('sheetName','名单');
 form.set('file',new Blob([bytes],{type:extension==='csv'?'text/csv':extension==='xls'?'application/vnd.ms-excel':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`课程.2026.09.${extension}`);
 const req=new Request('http://synthetic',{method:'POST',body:form});const incoming=Object.assign(Readable.from([Buffer.from(await req.arrayBuffer())]),{headers:Object.fromEntries(req.headers)});
 const received=await new RosterMultipartUploadService({},storage).receive(incoming,{organizationId:'synthetic',classSectionId:'synthetic'});
 assert.equal(received.fileFormat,format);assert.ok(objects.get(received.sourceFileStorageKey).equals(bytes));
 const parser=new RosterCsvParserService(storage);
 const input={sourceFileStorageKey:received.sourceFileStorageKey,expectedSha256:createHash('sha256').update(bytes).digest('hex'),sheetName:'名单',fieldMappingSnapshot:received.fieldMappingSnapshot};
 const parsed=extension==='csv'?await parser.parseStoredCsv(input):await parser.parseStoredXlsx(input);
 assert.equal(parsed.validRowCount,1);assert.equal(parsed.rows[0].normalizedStudentNumber,'000123');assert.equal(parsed.rows[0].fullName,'测试学生');
}
console.log(JSON.stringify({result:'PASS',formats:['CSV','XLSX','XLS'],originalBytes:true,workerParsing:true,leadingZero:true,chinese:true,productionWrites:0}));
