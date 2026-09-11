// Run only in the bounded helper container. Credentials remain in /perf/private.json.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {v7 as uuidv7} from 'uuid';
import {seedFoundationFixture,seedExerciseSessionStudent} from '/app/production-smoke-helpers.mjs';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
import {TokenService} from '/app/dist/modules/auth/token.service.js';
await loadRuntimeSecrets(process.env);
const config=validateEnvironment(process.env).RUNTIME_CONFIG;
assert.equal(config.appEnvironment,'production');
const db=new PrismaService(config),mode=process.argv[2],file='/perf/private.json';
try {
 let state;
 if(mode==='seed') {
  assert.ok(!fs.existsSync(file),'Refuse to overwrite fixture');
  const fixture=await seedFoundationFixture(db,'-PERF-'+Date.now().toString(36).toUpperCase());
  state={fixture,students:[],createdAt:new Date().toISOString()};
  fs.writeFileSync(file,JSON.stringify(state),{mode:0o600,flag:'wx'});
  // Serial inserts deliberately keep setup load below test load.
  for(let i=0;i<200;i++) {
   const student=await seedExerciseSessionStudent(db,fixture,'PF'+Date.now().toString(36).toUpperCase()+i,'ACTIVE',i===0);
   state.students.push(student);
   fs.writeFileSync(file,JSON.stringify(state),{mode:0o600});
  }
  await db.v81AccountSecurity.createMany({data:[fixture.teacherUserId,fixture.adminUserId].map(userId=>({userId,organizationId:fixture.organizationId,mustChangePassword:false,passwordChangedAt:new Date()}))});
 } else state=JSON.parse(fs.readFileSync(file,'utf8'));
 const org=await db.organization.findUniqueOrThrow({where:{id:state.fixture.organizationId}});
 assert.ok(org.organizationCode.startsWith('BNBU-TEST-PERF-'));
 if(mode==='close') {
  const issuer=new TokenService(config,{now:()=>new Date()},{next:uuidv7});
  const active=await db.exerciseSession.findMany({where:{organizationId:org.id,status:{in:['IN_PROGRESS','PAUSED']}}});
  for(const session of active){
   const s=state.students.find(x=>x.studentId===session.studentId);assert.ok(s);
   const token=(await issuer.issue({userId:s.userId,organizationId:org.id,role:'STUDENT',sessionId:s.authSessionId,tokenVersion:0})).token;
   const r=await fetch('http://127.0.0.1:3000/api/v1/exercise-sessions/'+session.id+'/cancel',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json','idempotency-key':uuidv7()},body:JSON.stringify({expectedVersion:session.version,reason:'Bounded capacity test recovery'})});
   assert.ok(r.ok,'Synthetic open session cancellation failed');
   await new Promise(r=>setTimeout(r,100));
  }
  const result=await db.user.updateMany({where:{organizationId:{in:[state.fixture.organizationId,state.fixture.isolationOrganizationId]}},data:{status:'DISABLED',tokenVersion:{increment:1}}});
  console.log(JSON.stringify({mode,disabled:result.count,organizationId:org.id}));
 } else {
  const issuer=new TokenService(config,{now:()=>new Date()},{next:uuidv7});
  const now=new Date();
  for(const student of state.students) {
   await db.authSession.update({where:{id:student.authSessionId},data:{absoluteExpiresAt:new Date(+now+7200000),idleExpiresAt:new Date(+now+7200000)}});
   student.token=(await issuer.issue({userId:student.userId,organizationId:org.id,role:'STUDENT',sessionId:student.authSessionId,tokenVersion:0})).token;
  }
  if(!state.teacherSessionId) {
   state.teacherSessionId=uuidv7();
   await db.authSession.create({data:{id:state.teacherSessionId,organizationId:org.id,userId:state.fixture.teacherUserId,status:'ACTIVE',tokenFamilyId:uuidv7(),createdAt:now,lastSeenAt:now,absoluteExpiresAt:new Date(+now+7200000),idleExpiresAt:new Date(+now+7200000)}});
  }
  state.teacherToken=(await issuer.issue({userId:state.fixture.teacherUserId,organizationId:org.id,role:'TEACHER',sessionId:state.teacherSessionId,tokenVersion:0})).token;
  if(!state.rulesConfigured){
   await db.classSection.update({where:{id:state.fixture.teacherAActiveSectionId},data:{checkInEndDate:new Date('2027-01-23T00:00:00Z'),dailyStartTime:new Date('1970-01-01T00:00:00Z'),dailyEndTime:new Date('1970-01-01T23:59:59Z')}});
   await db.v81AdminAccess.upsert({where:{userId:state.fixture.adminUserId},create:{userId:state.fixture.adminUserId,organizationId:org.id,kind:'SUPER',permissions:[],mustChangePassword:false},update:{}});
   const id=uuidv7();await db.authSession.create({data:{id,organizationId:org.id,userId:state.fixture.adminUserId,status:'ACTIVE',tokenFamilyId:uuidv7(),createdAt:now,lastSeenAt:now,absoluteExpiresAt:new Date(+now+3600000),idleExpiresAt:new Date(+now+3600000)}});
   const admin=(await issuer.issue({userId:state.fixture.adminUserId,organizationId:org.id,role:'ADMIN',sessionId:id,tokenVersion:0})).token;
   async function post(token,path,body){const r=await fetch('http://127.0.0.1:3000/api/v1'+path,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json','idempotency-key':uuidv7()},body:JSON.stringify(body)});const v=await r.json();assert.ok(r.ok,JSON.stringify({path,status:r.status,code:v.error?.code||v.code}));return v.data;}
   const existing=await db.$queryRawUnsafe('SELECT id FROM v81_rule_templates WHERE organization_id=$1::uuid ORDER BY version DESC LIMIT 1',org.id);
   const template=existing[0]||await post(admin,'/rule-templates',{displayName:'Bounded performance synthetic rules',expectedVersion:0});
   await post(state.teacherToken,'/class-sections/'+state.fixture.teacherAActiveSectionId+'/v81-rules',{templateId:template.id,minimumMinutes:30,weeklyLimit:3,courseTarget:600,generalTarget:600,regularDeadline:'2027-01-23T00:00:00Z',closingDeadline:'2027-01-30T00:00:00Z',settlementPlannedAt:'2027-01-30T01:00:00Z',publish:true,expectedVersion:0});
   state.rulesConfigured=true;
  }
  state.tokenIssuedAt=now.toISOString();
  fs.writeFileSync(file,JSON.stringify(state),{mode:0o600});
  if(mode==='activate'){
   let started=0;
   for(const s of state.students.slice(0,60)){
    const active=await db.exerciseSession.findFirst({where:{organizationId:org.id,studentId:s.studentId,status:{in:['IN_PROGRESS','PAUSED']}}});
    if(active)continue;
    const r=await fetch('http://127.0.0.1:3000/api/v1/exercise-sessions',{method:'POST',headers:{authorization:'Bearer '+s.token,'content-type':'application/json','idempotency-key':uuidv7()},body:JSON.stringify({enrollmentId:s.enrollmentId,clientObservedAt:new Date().toISOString()})});
    assert.ok(r.ok,'Synthetic active-session preparation failed');started++;
    await new Promise(r=>setTimeout(r,100));
   }
   console.log(JSON.stringify({mode:'activate',started,synthetic:true}));
  }
  console.log(JSON.stringify({mode,students:state.students.length,organizationId:org.id,tokenTtlSeconds:config.accessTokenTtlSeconds}));
 }
} finally {await db.$disconnect();}
