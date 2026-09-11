import assert from 'node:assert/strict';
import fs from 'node:fs';
import Ajv from '../../backend/node_modules/ajv/dist/2020.js';
import addFormats from '../../backend/node_modules/ajv-formats/dist/index.js';

export async function probeSettlementRead({request,baseUrl,teacherToken,adminToken,studentToken,otherTeacherTokens,fixture,prisma}) {
  const path=`/class-sections/${fixture.teacherAActiveSectionId}/settlement-reports`;
  const first=await request(path+'?limit=1',teacherToken);
  assert.equal(first.items.length,1);assert.equal(first.items[0].version,2);assert.equal(first.nextBeforeVersion,2);
  assert.equal('report' in first.items[0],false);
  const second=await request(path+'?limit=1&beforeVersion=2',teacherToken);
  assert.equal(second.items[0].version,1);assert.equal(second.nextBeforeVersion,null);
  const document=JSON.parse(fs.readFileSync(new URL('../../backend/src/generated/openapi.document.generated.json',import.meta.url),'utf8'));
  const ajv=new Ajv({strict:false,allErrors:true});addFormats(ajv);
  const validate=ajv.compile({$ref:'#/components/schemas/V81SettlementReportDetail',components:document.components});
  const {read,utils}=await import('../../backend/node_modules/xlsx/xlsx.mjs');
  for(const version of [1,2]) {
    const actual=await request(path+'/'+version,teacherToken);
    const [stored]=await prisma.$queryRaw`SELECT report,report_sha256 FROM v81_settlement_report_revisions
      WHERE class_section_id=${fixture.teacherAActiveSectionId}::uuid AND version=${version}`;
    assert.deepEqual(actual.report,stored.report);assert.equal(actual.reportSha256,stored.report_sha256);
    assert.ok(validate(actual),JSON.stringify(validate.errors));
    const exported=await request(path+'/'+version+'/export',teacherToken);
    assert.ok(exported.fileName.endsWith(`-v${version}.xlsx`));
    assert.equal(exported.generatedAt,actual.report.generatedAt);
    const workbook=read(Buffer.from(exported.fileBase64,'base64'),{type:'buffer'});
    const description=Object.fromEntries(utils.sheet_to_json(workbook.Sheets['说明'],{header:1}));
    assert.equal(description['报告性质'],'已保存的结算快照');
    assert.equal(description['报告版本'],version);assert.equal(description['报告摘要 SHA-256'],actual.reportSha256);
    assert.equal(description['摘要计算对象'],'数据库保存的规范 JSON');
    const rows=utils.sheet_to_json(workbook.Sheets['名单内'],{header:1});
    assert.equal(rows[1][rows[0].indexOf('实际计入（秒）')],version===1?3600:0);
    assert.equal(workbook.Sheets['名单内'].A2.t,'s');
    for(const name of workbook.SheetNames)for(const [address,cell] of Object.entries(workbook.Sheets[name]))
      if(!address.startsWith('!'))assert.equal(cell.f,undefined);
    assert.ok(workbook.SheetNames.includes('结算检查'));
    const checkRows=utils.sheet_to_json(workbook.Sheets['结算检查'],{header:1});
    if(actual.report.settlementChecks)actual.report.settlementChecks.forEach((check,index)=>{
      assert.equal(checkRows[index+1][0],check.code);assert.equal(checkRows[index+1][2],check.count??'未知');
    });
    else assert.equal(checkRows[0][1],'该历史版本未保存检查快照');
  }
  const status=async(route,token)=> (await fetch(baseUrl+route,{headers:token?{authorization:`Bearer ${token}`}:{}})).status;
  for(const suffix of ['', '/1','/1/export']) {
    assert.equal(await status(path+suffix),401);
    for(const token of [adminToken,studentToken])assert.equal(await status(path+suffix,token),403);
    for(const {token} of otherTeacherTokens)assert.equal(await status(path+suffix,token),404);
  }
  assert.equal(await status(path+'/3',teacherToken),404);
  assert.equal(await status(path+'/3/export',teacherToken),404);
  for(const suffix of ['/0','/-1','/2147483648','/abc','/0/export','/abc/export','?limit=0','?limit=101','?beforeVersion=0'])
    assert.equal(await status(path+suffix,teacherToken),422);
  assert.deepEqual(await request(path+'?beforeVersion=1',teacherToken),{items:[],nextBeforeVersion:null});
  console.log(JSON.stringify({check:'SETTLEMENT_REPORT_HTTP_VERSION_PAGINATION_IMMUTABLE_SNAPSHOT_SCHEMA_TEACHER_SCOPE',result:'PASS'}));
  console.log(JSON.stringify({check:'SETTLEMENT_XLSX_HISTORICAL_CREDIT_VERSION_HASH_SAVED_TIME_TEXT_CELLS_SCOPE',result:'PASS'}));
}
