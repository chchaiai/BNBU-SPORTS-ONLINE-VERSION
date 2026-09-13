// Production HTTP semester transitions in a new, isolated, empty-course fixture.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync,existsSync} from 'node:fs';
import {v7 as uuidv7} from 'uuid';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
import {TokenService} from '/app/dist/modules/auth/token.service.js';
const destination='/acceptance/isolated-semester-switch.json';
assert.ok(!existsSync(destination),'Evidence already exists; do not duplicate fixture');
await loadRuntimeSecrets(process.env);
const config=validateEnvironment(process.env).RUNTIME_CONFIG;
assert.equal(config.appEnvironment,'production');
const db=new PrismaService(config),organizationId=uuidv7(),userId=uuidv7(),sessionId=uuidv7(),now=new Date(),checks=[];
let seeded=false,token;
async function api(path,body,status=body?201:200,key=randomUUID()){
 const r=await fetch('https://www.teacher.bnbusports.cn/api/v1'+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':key},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 const v=await r.json();assert.equal(r.status,status,JSON.stringify({path,status:r.status,code:v.code}));return v.data;
}
try{
 await db.$transaction(async tx=>{
  await tx.organization.create({data:{id:organizationId,organizationCode:'SWT-'+Date.now(),legalName:'Synthetic semester switch acceptance',displayName:'Synthetic semester switch acceptance',timezone:'Asia/Shanghai',defaultLocale:'zh-CN',status:'ACTIVE',createdAt:now,updatedAt:now}});
  await tx.user.create({data:{id:userId,organizationId,role:'ADMIN',status:'ACTIVE',createdAt:now,updatedAt:now}});
  await tx.adminProfile.create({data:{id:uuidv7(),organizationId,userId,employeeNumber:'SYNTH-SWITCH',fullName:'Synthetic switch administrator',status:'ACTIVE',createdAt:now,updatedAt:now}});
  await tx.v81AdminAccess.create({data:{userId,organizationId,kind:'SUPER',permissions:[],mustChangePassword:false}});
  await tx.v81AccountSecurity.create({data:{userId,organizationId,mustChangePassword:false,passwordChangedAt:now}});
  await tx.systemPolicy.create({data:{organizationId,systemMode:'NORMAL',changedBy:userId,changeReason:'Isolated synthetic acceptance setup',updatedAt:now}});
  await tx.authSession.create({data:{id:sessionId,organizationId,userId,status:'ACTIVE',tokenFamilyId:uuidv7(),createdAt:now,lastSeenAt:now,absoluteExpiresAt:new Date(+now+600000),idleExpiresAt:new Date(+now+600000)}});
 });seeded=true;
 token=(await new TokenService(config,{now:()=>new Date()},{next:uuidv7}).issue({userId,organizationId,role:'ADMIN',sessionId,tokenVersion:0})).token;
 const first=await api('/admin/semesters',{academicYear:'2025-2026',termCode:'SECOND',displayName:'Synthetic previous semester',startDate:'2026-02-01',endDate:'2026-07-31'});
 let check=await api(`/admin/semesters/${first.id}/switch-check`);assert.equal(check.ready,true);assert.equal(check.current,null);assert.equal(check.totalCourseCount,0);
 const initial=await api(`/admin/semesters/${first.id}/switch`,{expectedVersion:first.version,currentSemesterId:null,currentSemesterVersion:null});assert.equal(initial.current.status,'CURRENT');checks.push('INITIAL_CURRENT_FROM_EMPTY_ORGANIZATION');
 const second=await api('/admin/semesters',{academicYear:'2026-2027',termCode:'FIRST',displayName:'Synthetic next semester',startDate:'2026-09-01',endDate:'2027-01-31'});
 check=await api(`/admin/semesters/${second.id}/switch-check`);assert.equal(check.ready,true);assert.equal(check.totalCourseCount,0);
 const input={expectedVersion:second.version,currentSemesterId:first.id,currentSemesterVersion:initial.current.version},key=randomUUID();
 const switched=await api(`/admin/semesters/${second.id}/switch`,input,201,key);
 assert.equal(switched.current.status,'CURRENT');assert.equal(switched.archived.id,first.id);assert.equal(switched.archived.status,'ARCHIVED');checks.push('CURRENT_SWITCH_AND_PREVIOUS_ARCHIVE');
 assert.deepEqual(await api(`/admin/semesters/${second.id}/switch`,input,201,key),switched);checks.push('IDEMPOTENT_REPLAY_IDENTICAL');
 await api(`/admin/semesters/${second.id}/switch`,input,409);checks.push('STALE_RETRY_REJECTED');
 const archivedCheck=await api(`/admin/semesters/${first.id}/switch-check`);assert.equal(archivedCheck.ready,false);
 await api(`/admin/semesters/${first.id}/switch`,{expectedVersion:switched.archived.version,currentSemesterId:second.id,currentSemesterVersion:switched.current.version},409);checks.push('ARCHIVED_RESTORE_REJECTED');
 const semesters=await db.semester.findMany({where:{organizationId}});assert.equal(semesters.filter(x=>x.status==='CURRENT').length,1);assert.equal(semesters.length,2);
 assert.equal(await db.v81Event.count({where:{organizationId,eventType:'CURRENT_SWITCHED'}}),2);checks.push('ONE_CURRENT_TWO_RETAINED_SEMESTERS_TWO_SWITCH_EVENTS');
}finally{
 if(seeded){await db.user.update({where:{id:userId},data:{status:'DISABLED',tokenVersion:{increment:1}}});assert.equal((await db.user.findUniqueOrThrow({where:{id:userId}})).status,'DISABLED');}
 const result={check:'ISOLATED_PRODUCTION_SEMESTER_SWITCH',observedAt:new Date().toISOString(),organizationId,userId,checks,pass:checks.length===6,syntheticAccessDisabled:seeded,limitations:'Empty-course organization only; no claim of settled-course history or browser acceptance. Synthetic semester and audit facts retained for final cleanup.'};
 writeFileSync(destination,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(result));await db.$disconnect();
}
