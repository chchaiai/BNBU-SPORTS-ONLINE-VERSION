import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const path = '/admin/review-services/ocr';
const input = expectedVersion => ({ provider:'TENCENT_TABLE_V3',region:'ap-shanghai',timeoutMs:1500,enabled:false,
  reason:'Synthetic OCR maintenance governance',expectedVersion });
export async function prepareOcrGovernance({ prisma, fixture, request, baseUrl, adminToken, teacherToken, worker, createJob, jobPath }) {
  const first = await request(path,adminToken);
  assert.equal(first.configurationSource,'DEPLOYMENT_ENVIRONMENT');
  assert.equal(first.configuration.version,0);assert.equal(first.jobs.queued,2);
  assert.equal(first.runtimeWorkerEnabled,false);assert.equal(first.executionEnabled,false);
  assert.equal(first.providerConnectivity,'UNVERIFIED');assert.equal(first.automaticPassValidation,'NOT_PROVIDED');
  const raw = (token,body) => fetch(baseUrl+path+(body?'/revisions':''),{method:body?'POST':'GET',
    headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':randomUUID()},
    ...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await raw(teacherToken)).status,403);
  assert.equal((await raw(teacherToken,input(0))).status,403);
  try {
    await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUB',permissions='["SYSTEM_MODE","GLOBAL_RULES"]'::jsonb WHERE user_id=${fixture.adminUserId}::uuid`;
    assert.equal((await raw(adminToken)).status,403);assert.equal((await raw(adminToken,input(0))).status,403);
  } finally { await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUPER',permissions='[]'::jsonb WHERE user_id=${fixture.adminUserId}::uuid`; }
  for(const bad of [{...input(0),provider:'UNAPPROVED_SERVICE'},{...input(0),region:null},
    {...input(0),provider:'DISABLED',enabled:true,region:null},{...input(0),secret:'SYNTHETIC_REJECTED_FIELD'},
    {...input(0),endpoint:'http://unapproved.invalid'}])assert.equal((await raw(adminToken,bad)).status,422);
  const key=randomUUID(),paused=await request(path+'/revisions',adminToken,input(0),key);
  assert.equal(paused.version,1);assert.deepEqual(await request(path+'/revisions',adminToken,input(0),key),paused);
  assert.equal((await createJob(jobPath)).status,503);assert.equal(await worker.processOne(fixture.organizationId),null);
  const policy=await prisma.systemPolicy.findUniqueOrThrow({where:{organizationId:fixture.organizationId}});
  const maintenance=await request('/system-mode/changes',adminToken,{mode:'MAINTENANCE',expectedVersion:policy.version,
    reason:'Synthetic OCR recovery',titleZh:'测试维护',titleEn:'Synthetic maintenance',bodyZh:'OCR配置测试',bodyEn:'OCR configuration test',
    estimatedRecoveryAt:new Date(Date.now()+60000).toISOString()});
  try {
    assert.equal((await request(path,adminToken)).systemMode,'MAINTENANCE');
    assert.equal((await request(path+'/revisions',adminToken,input(1))).version,2);
    assert.equal(await worker.processOne(fixture.organizationId),null);
  } finally { await request('/system-mode/changes',adminToken,{mode:'NORMAL',expectedVersion:maintenance.policyVersion,reason:'Synthetic recovery finished'}); }
  const contenders=await Promise.all([raw(adminToken,input(2)),raw(adminToken,{...input(2),reason:'Synthetic concurrent configuration'})]);
  assert.deepEqual(contenders.map(r=>r.status).sort(),[201,409]);
  await Promise.all(contenders.map(r=>r.arrayBuffer()));
  const history=await request(path+'/revisions?limit=2',adminToken);
  assert.deepEqual(history.items.map(r=>r.version),[3,2]);assert.equal(history.nextBeforeVersion,2);
  assert.deepEqual((await request(path+'/revisions?limit=2&beforeVersion=2',adminToken)).items.map(r=>r.version),[1]);
  await assert.rejects(prisma.$executeRaw`UPDATE v81_ocr_service_revisions SET enabled=true WHERE id=${paused.id}::uuid`);
  await assert.rejects(prisma.$executeRaw`DELETE FROM v81_ocr_service_revisions WHERE id=${paused.id}::uuid`);
  const enabled=await request(path+'/revisions',adminToken,{...input(3),enabled:true});
  assert.equal(enabled.version,4);
  assert.equal((await request(path,adminToken)).configuration.region,'ap-shanghai');
  console.log(JSON.stringify({check:'OCR_GOVERNANCE_SUPER_PERMISSION_PAUSE_MAINTENANCE_HISTORY_VERSION_REPLAY',result:'PASS',runtimeWorkerDeliberatelyDisabled:true}));
  return enabled;
}

export async function finishOcrGovernance({ prisma, fixture, request, adminToken, createJob, failedJob, storage, configuration, V81OcrWorker, TencentOcrProvider }) {
  const executions=await prisma.$queryRaw`SELECT service_version,region,timeout_ms FROM v81_ocr_execution_services WHERE organization_id=${fixture.organizationId}::uuid`;
  assert.equal(executions.length,3);
  assert.ok(executions.every(e=>e.service_version===4 && e.region==='ap-shanghai' && e.timeout_ms===1500));
  const response=await createJob(`/ocr-batches/${failedJob.batchId}/pages/${failedJob.pageId}/recognition`,undefined,randomUUID(),2);
  assert.equal(response.status,201);const queued=(await response.json()).data;
  let startedResolve,release;
  const started=new Promise(resolve=>{startedResolve=resolve;}),held=new Promise(resolve=>{release=resolve;});
  const provider=new TencentOcrProvider(configuration,{async request(){startedResolve();return held;}});
  let now=new Date();
  const worker=new V81OcrWorker(prisma,{ocr:configuration},{now:()=>now},provider,storage);
  const processing=worker.processOne(fixture.organizationId);
  await Promise.race([started,processing.then(()=>{throw new Error('Provider must start before changing configuration');}),
    delay(5000).then(()=>{throw new Error('Provider start observation timeout');})]);
  await request(path+'/revisions',adminToken,input(4));
  release({RequestId:'synthetic-stale-provider',TableDetections:[{Cells:[{Text:'000123',RowTl:1,RowBr:2,ColTl:0,ColBr:1,Confidence:95,
    Polygon:[{X:0,Y:0},{X:10,Y:0},{X:10,Y:10},{X:0,Y:10}]}]}]});
  assert.equal((await processing).status,'STALE');
  const pending=(await prisma.$queryRaw`SELECT status,result_attempt FROM v81_ocr_jobs WHERE id=${queued.id}::uuid`)[0];
  assert.equal(pending.status,'RUNNING');assert.equal(pending.result_attempt,null);
  assert.equal(Number((await prisma.$queryRaw`SELECT max(attempt) AS n FROM v81_ocr_page_attempts WHERE batch_id=${failedJob.batchId}::uuid AND page_id=${failedJob.pageId}::uuid`)[0].n),2);
  await request(path+'/revisions',adminToken,{...input(5),enabled:true});
  // Advance only the injected worker clock past the retained lease; the API remains on the real clock.
  now=new Date(now.getTime()+121000);
  assert.equal((await worker.processOne(fixture.organizationId)).status,'SUCCEEDED');
  const bindings=await prisma.$queryRaw`SELECT job_version,service_version FROM v81_ocr_execution_services WHERE job_id=${queued.id}::uuid ORDER BY job_version`;
  assert.deepEqual(bindings,[{job_version:2,service_version:4},{job_version:3,service_version:6}]);
  await assert.rejects(prisma.$executeRaw`UPDATE v81_ocr_execution_services SET service_version=999 WHERE job_id=${queued.id}::uuid`);
  const status=await request(path,adminToken);
  assert.deepEqual([status.jobs.queued,status.jobs.running,status.jobs.succeeded,status.jobs.failed],[0,0,3,1]);
  assert.equal(status.configuration.version,6);
  console.log(JSON.stringify({check:'OCR_SERVICE_EXECUTION_BINDING_STALE_RESULT_RESUME_SAME_TASK',result:'PASS',providerSimulated:true,leaseClockAdvanced:true}));
}
