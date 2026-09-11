import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function probeSemesterSwitch({prisma,fixture,request,baseUrl,adminToken,teacherToken,targetId,targetVersion=4}) {
  const post=(id,input,token=adminToken,key=randomUUID())=>fetch(baseUrl+`/admin/semesters/${id}/switch`,{
    method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':key},body:JSON.stringify(input)});
  const current=await prisma.semester.findUniqueOrThrow({where:{id:fixture.semesterId}});
  const input={expectedVersion:targetVersion,currentSemesterId:current.id,currentSemesterVersion:current.version};
  assert.equal((await post(targetId,input)).status,409); // Future target and unfinished old courses.
  assert.equal((await post(targetId,input,teacherToken)).status,403);
  assert.equal((await post(fixture.isolationSemesterId,input)).status,404);
  assert.equal((await post(targetId,{...input,currentSemesterId:null})).status,422);
  assert.equal((await post(targetId,{expectedVersion:4})).status,422);
  const arrived=await request('/admin/semesters',adminToken,{academicYear:'2025-2026',termCode:'SUMMER',
    displayName:'Synthetic arrived target',startDate:'2026-08-01',endDate:'2026-12-31'});
  const createInput={semesterId:arrived.id,courseId:fixture.activeCourseId,classCode:'SYNTH-SWITCH',
    displayName:'Synthetic course after switch',isEnrollmentOpen:false};
  const createCourse=(body,key=randomUUID())=>fetch(baseUrl+'/class-sections',{method:'POST',headers:{
    authorization:`Bearer ${teacherToken}`,'content-type':'application/json','idempotency-key':key},body:JSON.stringify(body)});
  assert.equal((await createCourse(createInput)).status,409);
  assert.equal(await prisma.classSection.count({where:{semesterId:arrived.id}}),0);
  assert.equal((await post(arrived.id,{...input,expectedVersion:1})).status,409); // Date alone cannot bypass unsettled courses.
  console.log(JSON.stringify({check:'SEMESTER_SWITCH_DATE_UNSETTLED_SCOPE_REQUIRED_VERSION_DENIED',result:'PASS'}));
  // Isolated fixture for an empty old semester. No course is declared settled by this setup.
  const [database]=await prisma.$queryRaw`SELECT current_database() AS name`;assert.ok(['v81_runtime_test','bnbu_sports_test'].includes(database.name));
  if(database.name==='bnbu_sports_test') assert.equal(process.env.TEST_DATABASE_RESET_CONFIRMATION,'BNBU_SPORTS_EPHEMERAL_TEST_DATABASE_V1');
  const empty=await request('/admin/semesters',adminToken,{academicYear:'2025-2026',termCode:'FIRST',
    displayName:'Synthetic empty old semester',startDate:'2026-01-01',endDate:'2026-07-31'});
  await prisma.$transaction(async tx=>{
    await tx.semester.update({where:{id:current.id},data:{status:'ARCHIVED'}});
    await tx.semester.update({where:{id:empty.id},data:{status:'CURRENT'}});
  });
  const history=await prisma.classSection.findMany({orderBy:{id:'asc'}});
  const enrollments=await prisma.enrollment.findMany({orderBy:{id:'asc'}});
  const valid={expectedVersion:1,currentSemesterId:empty.id,currentSemesterVersion:1};
  assert.equal((await post(arrived.id,{...valid,currentSemesterVersion:2})).status,409);
  try {
    for (const permissions of [[], ['COURSE_VIEW'], ['SEMESTER_MANAGE']]) {
      await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUB',permissions=${JSON.stringify(permissions)}::jsonb WHERE user_id=${fixture.adminUserId}::uuid`;
      // A stale version ensures an authorized request reaches the service without switching.
      assert.equal((await post(arrived.id,{...valid,currentSemesterVersion:2})).status,
        permissions.includes('SEMESTER_MANAGE')?409:403);
    }
  } finally {
    await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUPER',permissions='[]'::jsonb WHERE user_id=${fixture.adminUserId}::uuid`;
  }
  const before=await prisma.semester.findMany({orderBy:{id:'asc'}}),retryKey=randomUUID();
  await prisma.$executeRawUnsafe("CREATE FUNCTION probe_reject_semester_switch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic semester audit failure'; END; $$");
  let triggerCreated=false;
  try {
    await prisma.$executeRawUnsafe("CREATE TRIGGER probe_reject_semester_switch BEFORE INSERT ON v81_events FOR EACH ROW WHEN (NEW.event_type='CURRENT_SWITCHED') EXECUTE FUNCTION probe_reject_semester_switch()");
    triggerCreated=true;
    assert.equal((await post(arrived.id,valid,adminToken,retryKey)).status,500);
    assert.deepEqual(await prisma.semester.findMany({orderBy:{id:'asc'}}),before);
    const events=await prisma.$queryRaw`SELECT id FROM v81_events WHERE resource_id=${arrived.id}::uuid AND event_type='CURRENT_SWITCHED'`;
    assert.equal(events.length,0);
  } finally {
    if(triggerCreated)await prisma.$executeRawUnsafe('DROP TRIGGER probe_reject_semester_switch ON v81_events');
    await prisma.$executeRawUnsafe('DROP FUNCTION probe_reject_semester_switch()');
  }
  console.log(JSON.stringify({check:'SEMESTER_SWITCH_SUBADMIN_PERMISSION_AND_AUDIT_FAILURE_ROLLS_BACK_BOTH_SEMESTERS',result:'PASS',failure:'injected only in isolated test database; trigger removed'}));
  // Retry the exact failed command before concurrency to prove its key was not saved as success.
  const recovered=await post(arrived.id,valid,adminToken,retryKey);
  assert.equal(recovered.status,201);
  const recoveredResult=(await recovered.json()).data;
  assert.deepEqual((await (await post(arrived.id,valid,adminToken,retryKey)).json()).data,recoveredResult);
  // Concurrent replay and a new stale command must preserve the one committed result.
  const keys=[retryKey,randomUUID()],responses=await Promise.all(keys.map(key=>post(arrived.id,valid,adminToken,key)));
  assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);
  const winner=responses.findIndex(r=>r.status===201),result=(await responses[winner].json()).data;
  assert.equal(result.current.id,arrived.id);assert.equal(result.current.status,'CURRENT');assert.equal(result.current.version,2);
  assert.equal(result.archived.id,empty.id);assert.equal(result.archived.status,'ARCHIVED');assert.equal(result.archived.version,2);
  assert.deepEqual((await (await post(arrived.id,valid,adminToken,keys[winner])).json()).data,result);
  assert.equal((await post(arrived.id,{...valid,expectedVersion:2},adminToken,keys[winner])).status,409);
  assert.equal((await post(empty.id,{expectedVersion:2,currentSemesterId:arrived.id,currentSemesterVersion:2})).status,409);
  assert.equal(await prisma.semester.count({where:{organizationId:fixture.organizationId,status:'CURRENT'}}),1);
  const events=await prisma.$queryRaw`SELECT facts FROM v81_events WHERE resource_type='SEMESTER' AND resource_id=${arrived.id}::uuid AND event_type='CURRENT_SWITCHED'`;
  assert.equal(events.length,1);assert.deepEqual(events[0].facts.after,result);
  assert.deepEqual(await prisma.classSection.findMany({orderBy:{id:'asc'}}),history);
  assert.deepEqual(await prisma.enrollment.findMany({orderBy:{id:'asc'}}),enrollments);
  const courseKey=randomUUID(),created=await createCourse(createInput,courseKey);
  assert.equal(created.status,201);const createdBody=(await created.json()).data;
  assert.equal(createdBody.status,'ACTIVE');assert.equal(createdBody.semesterId,arrived.id);
  assert.deepEqual((await (await createCourse(createInput,courseKey)).json()).data,createdBody);
  assert.equal(await prisma.classSection.count({where:{semesterId:arrived.id}}),1);
  assert.equal((await createCourse({...createInput,semesterId:empty.id,classCode:'SYNTH-OLD'})).status,409);
  console.log(JSON.stringify({check:'COURSE_CREATION_UPCOMING_DENIED_SWITCH_THEN_ACTIVE_REPLAY_ARCHIVED_DENIED',result:'PASS'}));
  console.log(JSON.stringify({check:'SEMESTER_EMPTY_OLD_ATOMIC_SWITCH_CONCURRENT_REPLAY_UNIQUE_CURRENT_AUDIT_HISTORY',result:'PASS',fixture:'empty current semester prepared in isolated database; not settled-course acceptance'}));
}
