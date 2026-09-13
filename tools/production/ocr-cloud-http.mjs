// Real public HTTP, CVM worker, COS and Tencent OCR. Only this task's synthetic organization.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
const state = JSON.parse(fs.readFileSync('.local/ocr-triplatform-20260913-private.json'));
const base = 'https://www.teacher.bnbusports.cn/api/v1';
const teacher = state.teacherToken, admin = state.adminToken, student = state.studentSession.accessToken;
const sectionId = state.fixture.teacherAActiveSectionId, checks = [], batches = [];
async function api(path, token, body, expected = body === undefined ? 200 : 201, key = randomUUID()) {
  const multipart = body instanceof FormData;
  const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${token}`, 'idempotency-key': key, ...(multipart ? {} : {'content-type':'application/json'}) },
    ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }), signal: AbortSignal.timeout(65000) });
  const value = await response.json();
  assert.equal(response.status, expected, JSON.stringify({path,status:response.status,code:value.code}));
  return value.data;
}
try {
  const course = await api(`/class-sections/${sectionId}`, teacher);
  assert.match(course.displayName, /^Synthetic/);
  const configuration = await api('/admin/review-services/ocr', admin);
  assert.equal(configuration.runtimeWorkerEnabled, true);
  await api('/admin/review-services/ocr/revisions', admin, { provider:'TENCENT_TABLE_V3',region:'ap-guangzhou',
    timeoutMs:20000,enabled:true,reason:'Synthetic real OCR acceptance 20260913',expectedVersion:configuration.configuration.version });
  checks.push('OCR_CONFIGURATION_HTTP');
  for (const purpose of ['roster','physical']) {
    const bytes = fs.readFileSync(`.local/ocr-smoke/ocr-synthetic-${purpose}.png`);
    const form = new FormData(); form.append('pages',new Blob([bytes],{type:'image/png'}),`synthetic-${purpose}.png`);
    const batch = await api(`/class-sections/${sectionId}/ocr-${purpose}-batches`,teacher,form);
    batches.push({id:batch.id,purpose});
    const pageId = batch.pages[0].id, path = `/ocr-batches/${batch.id}`;
    const source = await api(`${path}/pages/${pageId}/source`,teacher);
    assert.equal(createHash('sha256').update(Buffer.from(source.fileBase64,'base64')).digest('hex'),createHash('sha256').update(bytes).digest('hex'));
    await api(`${path}/pages/${pageId}/source`,student,undefined,403);
    await api(`${path}/pages/${pageId}/recognition`,teacher,{expectedAttempt:0},201);
    let recognition;
    for (let attempt=0;attempt<30;attempt++) {
      recognition = await api(`${path}/pages/${pageId}/recognition`,teacher);
      if (recognition.latestAttempt) break;
      await new Promise(resolve=>setTimeout(resolve,2000));
    }
    assert.equal(recognition?.latestAttempt?.outcome,'SUCCEEDED');
    const evidence = recognition.latestAttempt.evidence;
    assert.ok(evidence.tables.flatMap(t=>t.cells).some(c=>c.text.includes('9900000001')));
    batches.at(-1).providerRequestId = evidence.requestId;
    const columns = purpose==='roster' ? {studentNumber:0,name:1} : {studentNumber:0,name:1,runType:2,elapsed:3,testedOn:4};
    const draft = await api(`${path}/draft`,teacher,{expectedVersion:0,selections:[{pageId,attempt:1,tableIndex:0,headerRow:0,columns}]});
    assert.equal(draft.rows.length,2);
    const expectedRows = purpose==='roster'
      ? [{studentNumber:'9900000001',name:'TEST ALPHA'},{studentNumber:'9900000002',name:'TEST BETA'}]
      : [{studentNumber:'9900000001',name:'TEST ALPHA',runType:'800m',elapsed:'4:30',testedOn:'2026-09-12'},
         {studentNumber:'9900000002',name:'TEST BETA',runType:'1000m',elapsed:'5:00',testedOn:'2026-09-12'}];
    // Teacher correction is explicit: source OCR is preserved and only the synthetic expected table is confirmed.
    const revised = await api(`${path}/draft/revisions`,teacher,{expectedVersion:1,rows:draft.rows.map((row,i)=>({
      id:row.id,values:expectedRows[i],reviewedAgainstSource:true}))});
    const key=randomUUID();
    const confirmPath=purpose==='roster'?`${path}/roster-confirmation`:`${path}/physical-confirmations`;
    const body=purpose==='roster'?{expectedDraftVersion:revised.version}:{expectedDraftVersion:revised.version,
      selections:draft.rows.map(row=>({rowId:row.id,expectedResultVersion:0}))};
    const confirmed=await api(confirmPath,teacher,body,201,key);
    assert.deepEqual(await api(confirmPath,teacher,body,201,key),confirmed);
    checks.push(`${purpose.toUpperCase()}_REAL_COS_OCR_DRAFT_CONFIRM_REPLAY`);
  }
  const own=await api(`/enrollments/${state.student.enrollmentId}/roster-status`,student);
  assert.equal(own.status,'MATCHED');
  const physical=await api(`/student/enrollments/${state.student.enrollmentId}/physical-result`,student);
  assert.equal(physical.status,'RECORDED');assert.equal(physical.result.elapsedSeconds,270);
  const summary=await api(`/admin/class-sections/${sectionId}/physical-summary`,admin);
  assert.equal(summary.recordedCount,2);assert.equal(summary.unresolvedRegistrationCount,0);
  checks.push('STUDENT_AND_ADMIN_RESULT_READBACK');
} finally {
  const result={check:'REAL_CLOUD_OCR_HTTP',observedAt:new Date().toISOString(),checks,batches,
    allChecksCompleted:checks.includes('STUDENT_AND_ADMIN_RESULT_READBACK'),syntheticOrganizationId:state.fixture.organizationId};
  fs.writeFileSync('evidence/ocr-triplatform-20260913/cloud-ocr-http.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
}
