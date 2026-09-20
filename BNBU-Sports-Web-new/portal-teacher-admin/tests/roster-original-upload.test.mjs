import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { utils, write } from 'xlsx';
import { parseRosterFile } from '../app/roster-import.ts';
import { rosterApiService } from '../app/roster-reconciliation-api-service.ts';

test('a replaced reconciliation result rejects confirmation instead of silently reporting success', async () => {
  const nativeFetch = globalThis.fetch, oldWindow = globalThis.window;
  const writes = [];
  globalThis.window = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
  globalThis.fetch = async (url, options = {}) => {
    if (options.method && options.method !== 'GET') writes.push(String(url));
    return Response.json({ data: String(url).endsWith('/current') ? null : [], meta: {} });
  };
  try {
    await assert.rejects(rosterApiService.updateResolution('synthetic-course', ['superseded-result'], 'CONFIRMED', 'Synthetic reason'), { code: 'STALE_ROSTER_RESULT' });
    assert.deepEqual(writes, []);
  } finally { globalThis.fetch = nativeFetch; globalThis.window = oldWindow; }
});

test('original CSV and XLSX bytes reach multipart and confirmation retries reuse the uploaded source', async () => {
  const nativeFetch = globalThis.fetch, oldWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
  try {
    for (const [extension, duplicate] of [['csv',false],['xlsx',false],['csv',true],['xlsx',true],['xls',false],['xls',true]]) {
      const workbook = utils.book_new();
      const rows=[['学号', '姓名'], ['000123', 'Synthetic Student']];
      if(duplicate)rows.push(['000123','Synthetic Duplicate']);
      utils.book_append_sheet(workbook, utils.aoa_to_sheet(rows), '名单');
      const bytes = write(workbook, { type: 'buffer', bookType: extension });
      const file = new File([bytes], `original.${extension}`);
      const parsed = await parseRosterFile(file);
      assert.equal(parsed.originalFile, file);
      const uploads = [], confirmationKeys = [];
      globalThis.fetch = async (url, options) => {
        if (options.body instanceof FormData) {
          uploads.push(options.body);
          return Response.json({ data: { id: 'source-id', status: 'VALIDATED', isCurrent: true, version: 3 }, meta: {} });
        }
        assert.ok(String(url).endsWith('/roster-imports/source-id/confirmation'));
        assert.deepEqual(JSON.parse(options.body), { expectedVersion: 3 });
        confirmationKeys.push(new Headers(options.headers).get('Idempotency-Key'));
        throw new TypeError('Synthetic lost confirmation response');
      };
      const input = { course: { id: 'course-id' }, parsed, mapping: parsed.suggestedMapping };
      await assert.rejects(rosterApiService.importOfficialRoster(input));
      await assert.rejects(rosterApiService.importOfficialRoster(input));
      assert.equal(uploads.length, 1);
      assert.equal(uploads[0].get('fileFormat'), extension.toUpperCase());
      assert.equal(uploads[0].get('sheetName'), extension !== 'csv' ? '名单' : null);
      const uploaded = uploads[0].get('file');
      assert.equal(uploaded.name, file.name);
      assert.ok(Buffer.from(await uploaded.arrayBuffer()).equals(bytes));
      assert.equal(confirmationKeys.length, 2);
      assert.ok(confirmationKeys[0]);
      assert.equal(confirmationKeys[0], confirmationKeys[1]);
    }
  } finally { globalThis.fetch = nativeFetch; globalThis.window = oldWindow; }
});

test('import confirms then checks membership automatically; retry after a lost check response never reuploads', async () => {
  const nativeFetch = globalThis.fetch, oldWindow = globalThis.window;
  globalThis.window = { localStorage: {getItem: () => null, setItem: () => {}, removeItem: () => {}} };
  const imported = {id:'auto-source', classSectionId:'auto-course', status:'VALIDATED', isCurrent:true, version:1, versionNumber:1, totalRowCount:1, validRowCount:1, invalidRowCount:0, duplicatedRowCount:0, importedAt:'2026-09-20T00:00:00Z', source:'FILE'};
  const writes=[], alignmentKeys=[];
  try {
    const parsed = await parseRosterFile(new File(['学号,姓名\n000123,待进班学生'], 'roster.csv'));
    const input={course:{id:'auto-course'},parsed,mapping:parsed.suggestedMapping};
    globalThis.fetch = async (url, options={}) => {
      const path=new URL(String(url),'http://synthetic').pathname;
      if(options.method==='POST') writes.push(path);
      if(options.body instanceof FormData) return Response.json({data:imported});
      if(path.endsWith('/confirmation')) return Response.json({data:{id:'confirmation'}});
      if(path.endsWith('/align')) {
        alignmentKeys.push(new Headers(options.headers).get('Idempotency-Key'));
        assert.deepEqual(JSON.parse(options.body),{expectedRosterImportVersion:1});
        if(alignmentKeys.length===1) throw new TypeError('Synthetic lost check response');
        return Response.json({data:{id:'run',status:'COMPLETED',completedAt:'2026-09-20T01:00:00Z'}});
      }
      if(path.endsWith('/current')) return Response.json({data:imported});
      if(path.endsWith('/entries')) return Response.json({data:[{id:'entry',classSectionId:'auto-course',studentNumber:'000123',fullName:'待进班学生',gender:null,gradeYear:null,sourceRowNumber:2}],meta:{}});
      if(path.endsWith('/roster-alignment-results')) return Response.json({data:[{id:'result',classSectionId:'auto-course',rosterEntryId:'entry',status:'MISSING_IN_PLATFORM',differences:[],resolutionStatus:'PENDING',createdAt:'2026-09-20T01:00:00Z',version:1}],meta:{}});
      return Response.json({data:[imported],meta:{}});
    };
    await assert.rejects(rosterApiService.importOfficialRoster(input),{code:'ROSTER_CHECK_INCOMPLETE'});
    const result=await rosterApiService.importOfficialRoster(input);
    assert.equal(result.stats.notJoined,1);
    assert.equal(result.results[0].officialStudent.studentNumber,'000123');
    assert.deepEqual(writes.map(x=>x.split('/').pop()),['roster-imports','confirmation','align','confirmation','align']);
    assert.ok(alignmentKeys[0]);assert.equal(alignmentKeys[0],alignmentKeys[1]);
  } finally {globalThis.fetch=nativeFetch;globalThis.window=oldWindow;}
});

test('reselected duplicate file reuses current confirmation and checks again; changed columns and historical files are explicit', async () => {
 const nativeFetch=globalThis.fetch,oldWindow=globalThis.window;
 globalThis.window={localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}};
 const imported={id:'repeat-source',classSectionId:'repeat-course',status:'VALIDATED',isCurrent:true,version:1,totalRowCount:1,validRowCount:1};
 const entry={id:'entry',studentNumber:'000123',fullName:'Student',gender:null,gradeYear:null,collegeName:null,majorName:null,administrativeClassName:null,sourceRowNumber:2};
 let duplicateId=imported.id,storedName='Student',confirmed=true;const writes=[];
 try {
  globalThis.fetch=async(url,options={})=>{
   const path=new URL(String(url),'http://test').pathname;
   if(options.method==='POST')writes.push(path);
   if(options.body instanceof FormData)return Response.json({code:'ROSTER_IMPORT_DUPLICATE',details:{rosterImportId:duplicateId}},{status:409});
   if(path.endsWith('/source'))return Response.json({data:{sourceSha256:duplicateId===imported.id?createHash('sha256').update('学号,姓名\n000123,Student').digest('hex'):'historical'}});
   if(path.endsWith('/current'))return Response.json({data:imported});
   if(path.endsWith('/entries'))return Response.json({data:[{...entry,fullName:storedName}],meta:{}});
   if(path.endsWith('/confirmation'))return confirmed||options.method==='POST'?Response.json({data:{id:'confirmed'}}):Response.json({code:'PERMISSION_RESOURCE_NOT_FOUND'},{status:404});
   if(path.endsWith('/align'))return Response.json({data:{status:'COMPLETED'}});
   return Response.json({data:[],meta:{}});
  };
  const input=async()=>{const parsed=await parseRosterFile(new File(['学号,姓名\n000123,Student'],'repeat.csv'));return {course:{id:'repeat-course'},parsed,mapping:parsed.suggestedMapping};};
  await rosterApiService.importOfficialRoster(await input());
  await rosterApiService.importOfficialRoster(await input());
  assert.equal(writes.filter(p=>p.endsWith('/align')).length,2);
  assert.equal(writes.filter(p=>p.endsWith('/confirmation')).length,0);
  confirmed=false;await rosterApiService.importOfficialRoster(await input());
  assert.equal(writes.filter(p=>p.endsWith('/confirmation')).length,1);
  storedName='Different';await assert.rejects(rosterApiService.importOfficialRoster(await input()),{code:'ROSTER_DUPLICATE_MAPPING'});
  duplicateId='historical';await assert.rejects(rosterApiService.importOfficialRoster(await input()),{code:'ROSTER_DUPLICATE_HISTORICAL'});
  assert.equal(writes.filter(p=>p.endsWith('/align')).length,3);
 }finally{globalThis.fetch=nativeFetch;globalThis.window=oldWindow;}
});
