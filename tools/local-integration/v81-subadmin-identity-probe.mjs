import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { seedExerciseSessionStudent } from '../../backend/test/helpers/exercise-session.ts';

export async function probeSubadminIdentity({ prisma, fixture, request, baseUrl, adminToken, teacherToken, readMailboxJson = async url => (await fetch(url)).json() }) {
  const email = `identity-${randomUUID()}@example.test`, path = '/admin/subadmin-identity-challenges', issueKey = randomUUID();
  const input = { email, locale: 'en' }, challenge = await request(path, adminToken, input, issueKey);
  assert.equal(challenge.status, 'ACTIVE');
  assert.deepEqual(await request(path, adminToken, input, issueKey), challenge);
  const raw = (route, token, body) => fetch(baseUrl+route,{ method:'POST',headers:{authorization:`Bearer ${token}`,
    'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify(body) });
  assert.equal((await raw(path,adminToken,input)).status,429);
  assert.equal((await raw(path,teacherToken,input)).status,403);
  let code;
  for(let i=0;i<30&&!code;i++){
    const messages=await readMailboxJson('http://mailpit:8025/api/v1/messages?limit=50');
    const message=messages.messages?.find(item=>JSON.stringify(item.To??[]).toLowerCase().includes(email));
    if(message){const detail=await readMailboxJson(`http://mailpit:8025/api/v1/message/${encodeURIComponent(message.ID)}`);
      assert.match(detail.Subject,/administrator identity verification/);
      code=String(detail.Text??'').match(/code is\s*(\d{6})/u)?.[1];}
    if(!code)await delay(500);
  }
  assert.ok(code,'Identity OTP received through SMTP');
  const verifyPath=path+'/'+challenge.id+'/verify';
  const wrong=await raw(verifyPath,adminToken,{code:code==='000000'?'111111':'000000',expectedVersion:2});
  assert.equal(wrong.status,401);
  const [attempt]=await prisma.$queryRaw`SELECT attempts,version FROM v81_subadmin_identity_challenges WHERE id=${challenge.id}::uuid`;
  assert.deepEqual(attempt,{attempts:1,version:3});
  const verifyKey=randomUUID(),verification={code,expectedVersion:3};
  const proof=await request(verifyPath,adminToken,verification,verifyKey);
  assert.equal(proof.status,'VERIFIED');
  assert.deepEqual(await request(verifyPath,adminToken,verification,verifyKey),proof);
  const createBody={identityChallengeId:challenge.id,account:'synthetic-'+randomUUID(),name:'Synthetic OTP administrator',department:'',
    permissions:['AUDIT_QUERY'],initialPassword:'x',confirmPassword:'x'};
  assert.equal((await raw('/admin/subadmins',teacherToken,createBody)).status,403);
  assert.equal((await raw('/admin/subadmins',adminToken,{...createBody,confirmPassword:'z'})).status,422);
  assert.equal((await raw('/admin/subadmins',adminToken,{...createBody,permissions:[]})).status,422);
  const createKey=randomUUID(),created=await request('/admin/subadmins',adminToken,createBody,createKey);
  assert.deepEqual(await request('/admin/subadmins',adminToken,createBody,createKey),created);
  assert.equal(created.email,email);assert.equal(created.status,'ACTIVE');
  const listed = await request('/admin/subadmins',adminToken);
  assert.ok(listed.items.some(item => item.id === created.id && item.email === email));
  assert.equal((await fetch(baseUrl+'/admin/subadmins',{headers:{authorization:`Bearer ${teacherToken}`}})).status,403);
  assert.ok(!Object.hasOwn(created,'passwordHash')&&!Object.hasOwn(created,'initialPassword'));
  assert.equal((await raw('/admin/subadmins',adminToken,{...createBody,account:'other-'+randomUUID()})).status,401);
  const [consumed]=await prisma.$queryRaw`SELECT status,consumed_by FROM v81_subadmin_identity_challenges WHERE id=${challenge.id}::uuid`;
  assert.deepEqual(consumed,{status:'CONSUMED',consumed_by:created.id});
  const user=await prisma.user.findUniqueOrThrow({where:{id:created.id}});assert.ok(user.emailVerifiedAt);assert.match(user.passwordHash,/^\$argon2id\$/);
  const login=await request('/auth/password-login',null,{account:created.account,password:'x'});
  const security=await request('/auth/account-security',login.accessToken);assert.equal(security.mustChangePassword,true);
  const denied=await fetch(baseUrl+'/admin/audit-events',{headers:{authorization:`Bearer ${login.accessToken}`}});assert.equal(denied.status,403);
  await request('/auth/own-password',login.accessToken,{currentPassword:'x',newPassword:'y',confirmPassword:'y',expectedVersion:security.version});
  const next=await request('/auth/password-login',null,{account:created.account,password:'y'});
  assert.ok(await request('/admin/audit-events',next.accessToken));
  assert.equal((await raw(path,next.accessToken,{email:`denied-${randomUUID()}@example.test`,locale:'en'})).status,403);
  const events=await prisma.$queryRaw`SELECT facts FROM v81_events WHERE resource_type='SUBADMIN' AND resource_id=${created.id}::uuid AND event_type='CREATED'`;
  assert.equal(events.length,1);assert.ok(!JSON.stringify(events).includes(code));
  const statusPath=`/admin/subadmins/${created.id}/status`;
  const [access]=await prisma.$queryRaw`SELECT version FROM v81_admin_access WHERE user_id=${created.id}::uuid`;
  assert.equal((await raw(statusPath,adminToken,{status:'DISABLED',expectedVersion:access.version})).status,422);
  const disableBody={status:'DISABLED',expectedVersion:access.version,handoverCompleted:true},disableKey=randomUUID();
  const disabled=await request(statusPath,adminToken,disableBody,disableKey);
  assert.equal(disabled.status,'DISABLED');assert.equal(disabled.version,access.version+1);
  assert.deepEqual(await request(statusPath,adminToken,disableBody,disableKey),disabled);
  const revoked=await fetch(baseUrl+'/admin/audit-events',{headers:{authorization:`Bearer ${next.accessToken}`}});
  assert.equal(revoked.status,401);
  assert.equal((await raw(statusPath,adminToken,{status:'ACTIVE',expectedVersion:1})).status,409);
  const enabled=await request(statusPath,adminToken,{status:'ACTIVE',expectedVersion:disabled.version});
  assert.equal(enabled.version,disabled.version+1);assert.equal(enabled.status,'ACTIVE');
  const resumed=await request('/auth/password-login',null,{account:created.account,password:'y'});
  assert.ok(await request('/admin/audit-events',resumed.accessToken));
  const beforeProfile=await prisma.user.findUniqueOrThrow({where:{id:created.id}});
  const profilePath=`/admin/subadmins/${created.id}/profile`,profileBody={expectedVersion:enabled.version,
    name:'Updated synthetic administrator',department:'Synthetic department',email,permissions:[]};
  assert.equal((await raw(profilePath,teacherToken,profileBody)).status,403);
  assert.equal((await raw(profilePath,adminToken,{...profileBody,email:`unverified-${randomUUID()}@example.test`})).status,401);
  const profileKey=randomUUID(),profile=await request(profilePath,adminToken,profileBody,profileKey);
  assert.deepEqual(await request(profilePath,adminToken,profileBody,profileKey),profile);
  assert.equal(profile.account,created.account);assert.equal(profile.version,enabled.version+1);
  assert.equal(profile.name,profileBody.name);assert.deepEqual(profile.permissions,[]);
  assert.equal((await raw(profilePath,adminToken,profileBody)).status,409);
  const noPermission=await fetch(baseUrl+'/admin/audit-events',{headers:{authorization:`Bearer ${resumed.accessToken}`}});
  assert.equal(noPermission.status,403);
  const userAfter=await prisma.user.findUniqueOrThrow({where:{id:created.id}});
  assert.equal(userAfter.passwordHash,beforeProfile.passwordHash);
  assert.equal(userAfter.primaryEmail,email);
  const profileEvents=await prisma.$queryRaw`SELECT facts FROM v81_events WHERE resource_id=${created.id}::uuid AND event_type='PROFILE_UPDATED'`;
  assert.equal(profileEvents.length,1);assert.ok(!JSON.stringify(profileEvents).includes(email));
  const changedEmail=`changed-${randomUUID()}@example.test`;
  const changedChallenge=await request(path,adminToken,{email:changedEmail,locale:'en'});
  let changedCode;
  for(let attempt=0;attempt<30&&!changedCode;attempt++) {
    const messages=await readMailboxJson('http://mailpit:8025/api/v1/messages?limit=50');
    const message=messages.messages?.find(item=>JSON.stringify(item.To??[]).includes(changedEmail));
    if(message){const mail=await readMailboxJson(`http://mailpit:8025/api/v1/message/${encodeURIComponent(message.ID)}`);changedCode=(mail.Text??'').match(/\b\d{6}\b/)?.[0];}
    if(!changedCode)await delay(100);
  }
  assert.ok(changedCode);
  await request(`${path}/${changedChallenge.id}/verify`,adminToken,{code:changedCode,expectedVersion:changedChallenge.version});
  const changedBody={...profileBody,expectedVersion:profile.version,email:changedEmail,identityChallengeId:changedChallenge.id};
  assert.equal((await raw(profilePath,adminToken,{...changedBody,email:`mismatch-${randomUUID()}@example.test`})).status,401);
  const changed=await request(profilePath,adminToken,changedBody);
  assert.equal(changed.email,changedEmail);assert.equal(changed.account,created.account);
  const [changedProof]=await prisma.$queryRaw`SELECT status,consumed_by FROM v81_subadmin_identity_challenges WHERE id=${changedChallenge.id}::uuid`;
  assert.deepEqual(changedProof,{status:'CONSUMED',consumed_by:created.id});
  const changedUser=await prisma.user.findUniqueOrThrow({where:{id:created.id}});
  assert.equal(changedUser.passwordHash,beforeProfile.passwordHash);assert.equal(changedUser.primaryEmailNormalized,changedEmail);
  assert.ok(await request('/auth/password-login',null,{account:created.account,password:'y'}));
  console.log(JSON.stringify({check:'SUBADMIN_EMAIL_CHANGE_MATCHING_OTP_CONSUMPTION_LOGIN_PRESERVED',result:'PASS'}));
  const preferenceData=userId=>({id:randomUUID(),organizationId:fixture.organizationId,userId,locale:'en',
    pushEnabled:false,emailEnabled:false,createdAt:new Date(),updatedAt:new Date()});
  const subPreference=await prisma.userPreference.upsert({where:{userId:created.id},update:{},create:preferenceData(created.id)});
  await prisma.userPreference.delete({where:{id:subPreference.id}});
  const [retiredPreference]=await prisma.$queryRaw`SELECT retired_at FROM v81_user_preference_subjects WHERE id=${subPreference.id}::uuid`;
  assert.ok(retiredPreference.retired_at);
  const superPreference=await prisma.userPreference.upsert({where:{userId:fixture.adminUserId},update:{},create:preferenceData(fixture.adminUserId)});
  await assert.rejects(prisma.userPreference.delete({where:{id:superPreference.id}}));
  assert.ok(await prisma.userPreference.findUnique({where:{id:superPreference.id}}));
  console.log(JSON.stringify({check:'SUBADMIN_PREFERENCE_CLEANUP_RETAINS_HISTORY_OTHER_ROLE_DELETE_DENIED',result:'PASS'}));
  const relatedReceipts=await prisma.idempotencyRecord.findMany({where:{organizationId:fixture.organizationId,
    OR:[{resourceType:'SUBADMIN',resourceId:created.id},{resourceType:'SUBADMIN_IDENTITY',resourceId:{in:[challenge.id,changedChallenge.id]}}]},
    select:{id:true,operationId:true,resourceType:true,resourceId:true}});
  for(const operationId of ['requestV81SubadminIdentity','verifyV81SubadminIdentity','createV81VerifiedSubadmin','updateV81VerifiedSubadmin'])
    assert.ok(relatedReceipts.some(row=>row.operationId===operationId),`Receipt resource reference missing: ${operationId}`);
  assert.equal(relatedReceipts.filter(row=>row.operationId==='createV81VerifiedSubadmin').length,1);
  console.log(JSON.stringify({check:'SUBADMIN_PII_RECEIPTS_LINKED_TO_ACCOUNT_OR_IDENTITY_RESOURCE',result:'PASS'}));
  // Simulate pre-reference receipts to exercise backward-compatible scope cleanup.
  await prisma.idempotencyRecord.updateMany({where:{resourceId:{in:[created.id,challenge.id,changedChallenge.id]}},
    data:{resourceId:null,resourceType:null}});
  const feedbackAccess=await request(`/admin/subadmins/${created.id}/permissions`,adminToken,{expectedVersion:changed.version,permissions:['STUDENT_FEEDBACK']});
  const member=await seedExerciseSessionStudent(prisma,fixture,randomUUID().slice(0,8).toUpperCase());
  const feedback=await prisma.feedback.create({data:{id:randomUUID(),organizationId:fixture.organizationId,createdByUserId:member.userId,
    category:'PRIVACY',content:'Synthetic feedback retained after handler account deletion',status:'OPEN',createdAt:new Date(),updatedAt:new Date()}});
  const handlerLogin=await request('/auth/password-login',null,{account:created.account,password:'y'});
  await request(`/admin/feedback/${feedback.id}/handling`,handlerLogin.accessToken,{status:'RESOLVED',publicReply:'Synthetic completed reply',expectedVersion:1});
  const feedbackBefore=await request(`/admin/feedback/${feedback.id}`,adminToken);
  const feedbackEvents=await prisma.feedbackEvent.findMany({where:{feedbackId:feedback.id}});
  const push=await prisma.pushDevice.create({data:{id:randomUUID(),organizationId:fixture.organizationId,userId:created.id,
    authSessionId:handlerLogin.sessionId,platform:'IOS',appVersion:'synthetic',locale:'en',status:'ACTIVE',
    registrationTokenHash:randomUUID().replaceAll('-','').repeat(2),registrationTokenCiphertext:'synthetic-private-token',
    encryptionKeyVersion:1,registeredAt:new Date(),updatedAt:new Date()}});
  const deletePath=`/admin/subadmins/${created.id}/delete`,deleteBody={expectedVersion:feedbackAccess.version,handoverCompleted:true};
  assert.equal((await raw(deletePath,teacherToken,deleteBody)).status,403);
  assert.equal((await raw(deletePath,adminToken,{...deleteBody,handoverCompleted:false})).status,422);
  const deleteKey=randomUUID();
  const [deleted,concurrentDeleted]=await Promise.all([request(deletePath,adminToken,deleteBody,deleteKey),request(deletePath,adminToken,deleteBody,deleteKey)]);
  assert.deepEqual(concurrentDeleted,deleted);
  assert.equal(deleted.deleted,true);assert.equal(deleted.id,created.id);
  assert.deepEqual(await request(deletePath,adminToken,deleteBody,deleteKey),deleted);
  assert.equal(await prisma.user.findUnique({where:{id:created.id}}),null);
  assert.ok(!(await request('/admin/subadmins',adminToken)).items.some(item => item.id === created.id));
  assert.equal(await prisma.adminProfile.findUnique({where:{userId:created.id}}),null);
  assert.equal(await prisma.authSession.count({where:{userId:created.id}}),0);
  assert.ok(relatedReceipts.length>=4);
  assert.equal(await prisma.idempotencyRecord.count({where:{id:{in:relatedReceipts.map(row=>row.id)}}}),0);
  const [retired]=await prisma.$queryRaw`SELECT retired_at FROM v81_user_subjects WHERE id=${created.id}::uuid`;
  assert.ok(retired.retired_at);
  assert.equal((await fetch(baseUrl+'/auth/account-security',{headers:{authorization:`Bearer ${resumed.accessToken}`}})).status,401);
  const kept=await prisma.$queryRaw`SELECT event_type FROM v81_events WHERE resource_id=${created.id}::uuid`;
  assert.ok(kept.some(row=>row.event_type==='CREATED'));assert.equal(kept.filter(row=>row.event_type==='DELETED').length,1);
  assert.equal(await prisma.pushDevice.findUnique({where:{id:push.id}}),null);
  const [retiredPush]=await prisma.$queryRaw`SELECT retired_at FROM v81_push_device_subjects WHERE id=${push.id}::uuid`;
  assert.ok(retiredPush.retired_at);
  const feedbackAfter=await request(`/admin/feedback/${feedback.id}`,adminToken);
  assert.equal(feedbackAfter.publicReply,feedbackBefore.publicReply);
  assert.equal(feedbackAfter.status,'RESOLVED');assert.equal(feedbackAfter.history.length,feedbackBefore.history.length);
  assert.deepEqual(await prisma.feedbackEvent.findMany({where:{feedbackId:feedback.id}}),feedbackEvents);
  console.log(JSON.stringify({check:'SUBADMIN_DELETE_CONCURRENT_REPLAY_PUSH_CLEANUP_FEEDBACK_HISTORY',result:'PASS'}));
  console.log(JSON.stringify({check:'SUBADMIN_DELETE_CURRENT_ACCOUNT_LEGACY_RECEIPTS_REPLAY_HISTORY',result:'PASS'}));
  console.log(JSON.stringify({check:'SUBADMIN_PROFILE_ATOMIC_UPDATE_REPLAY_VERSION_PERMISSION_REVOKE',result:'PASS'}));
  console.log(JSON.stringify({check:'SUBADMIN_STATUS_HANDOVER_REPLAY_SESSION_REVOCATION_REENABLE',result:'PASS'}));
  console.log(JSON.stringify({check:'SUBADMIN_SMTP_OTP_VERIFY_CONSUME_CREATE_FIRST_PASSWORD_CHANGE_PERMISSION',result:'PASS',syntheticIdentity:true}));
}
