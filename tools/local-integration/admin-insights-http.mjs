import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
import {createTestPrisma,seedFoundationFixture} from '../../backend/test/helpers/database.ts';
import {seedSubmittedExerciseRecord} from '../../backend/test/helpers/exercise-review.ts';
import {foundationEnvironment,TEST_PRIVATE_KEY} from '../../backend/test/helpers/test-environment.ts';
const require=createRequire(new URL('../../backend/package.json',import.meta.url));
const {SignJWT,importPKCS8}=require('jose');
const url=process.env.INSIGHTS_TEST_DATABASE;
assert.match(new URL(url).pathname,/^\/bnbu_insights_\d+$/);
const prisma=createTestPrisma(url),port=53292,base=`http://127.0.0.1:${port}/api/v1`;
const scope=await seedFoundationFixture(prisma,randomUUID().slice(0,8).toUpperCase());
const record=await seedSubmittedExerciseRecord(prisma,scope,'I'+randomUUID().slice(0,4),'VALID',{actualSeconds:3600,maximumSeconds:null},{creditType:'COURSE_RELATED',sportType:'OTHER',sportName:'Wed'});
await prisma.v81AdminAccess.create({data:{userId:scope.adminUserId,organizationId:scope.organizationId,kind:'SUPER',permissions:[],mustChangePassword:false}});
await prisma.classSection.update({where:{id:scope.teacherAActiveSectionId},data:{displayName:'高尔夫(Wed)1004'}});
await prisma.$executeRaw`INSERT INTO v81_record_workflows(record_id,organization_id,stage) VALUES(${record.recordId}::uuid,${scope.organizationId}::uuid,'VALID') ON CONFLICT(record_id) DO UPDATE SET stage='VALID'`;
for (const userId of [scope.adminUserId,scope.teacherUserId]) await prisma.$executeRaw`INSERT INTO v81_account_security(user_id,organization_id,must_change_password) VALUES(${userId}::uuid,${scope.organizationId}::uuid,false) ON CONFLICT(user_id) DO UPDATE SET must_change_password=false`;
const key=await importPKCS8(TEST_PRIVATE_KEY,'EdDSA');
async function token(userId,role,organizationId=scope.organizationId){const sessionId=randomUUID(),now=new Date();await prisma.authSession.create({data:{id:sessionId,organizationId,userId,status:'ACTIVE',tokenFamilyId:randomUUID(),createdAt:now,lastSeenAt:now,absoluteExpiresAt:new Date(Date.now()+3600000),idleExpiresAt:new Date(Date.now()+3600000)}});return new SignJWT({organizationId,role,sessionId,tokenVersion:0}).setProtectedHeader({alg:'EdDSA',typ:'JWT'}).setSubject(userId).setJti(randomUUID()).setIssuer('bnbu-sports-test').setAudience('bnbu-sports-test-clients').setIssuedAt().setExpirationTime('30m').sign(key);}
const admin=await token(scope.adminUserId,'ADMIN'),teacher=await token(scope.teacherUserId,'TEACHER'),student=await token(record.studentUserId,'STUDENT');
const child=spawn(process.execPath,[process.env.INSIGHTS_MAIN??'dist/main.js'],{cwd:new URL('../../backend',import.meta.url),env:{...foundationEnvironment(url,port),ACCESS_TOKEN_TTL:'1800',REFRESH_TOKEN_IDLE_TTL:'3600',REFRESH_TOKEN_ABSOLUTE_TTL:'7200'},stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
async function call(path,access=admin,body,key=randomUUID()){const r=await fetch(base+path,{method:body?'PATCH':'GET',headers:{authorization:`Bearer ${access}`,...(body?{'content-type':'application/json','idempotency-key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,...await r.json()};}
let checks=0;const pass=name=>{checks++;console.log('PASS '+name);};
try{
 for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(output);try{if((await fetch(base+'/health/live')).ok)break;}catch{}await delay(150);}
 const list=await call('/exercise-records?limit=1&page=1');assert.equal(list.status,200,JSON.stringify(list));assert.equal(list.meta.pagination.total,1);assert.equal(list.meta.pagination.totalPages,1);assert.equal(list.data[0].sportName,'高尔夫');assert.ok(list.data[0].startedAt);assert.ok(list.data[0].endedAt);pass('full totals, seconds timestamps and legacy weekday sport projection');
 assert.equal((await call('/exercise-records?workflowStage=INVALID')).meta.pagination.total,0);assert.equal((await call('/exercise-records?sportType=RUNNING')).meta.pagination.total,0);assert.equal((await call('/exercise-records?creditType=GENERAL')).meta.pagination.total,0);assert.equal((await call('/exercise-records?page=2&limit=1')).data.length,0);pass('filters and page boundaries');
 assert.equal((await call('/exercise-records?studentId='+scope.teacherCProfileId,student)).data.length,0);pass('student filter cannot override student authorization');
 const insights=await call('/admin/insights');assert.equal(insights.status,200,JSON.stringify(insights));assert.equal(insights.data.summary.records,1);assert.equal(insights.data.summary.students,1);assert.equal(insights.data.daily.reduce((n,r)=>n+r.value,0),1);assert.equal(insights.data.heatmap.reduce((n,r)=>n+r.value,0),1);assert.equal(insights.data.frequency[0].value,1);pass('real database aggregates reconcile');
 assert.equal((await call('/admin/insights?classSectionId='+scope.teacherCSectionId)).data.summary.records,0);assert.equal((await call('/admin/insights',teacher)).status,403);assert.equal((await call('/admin/insights',student)).status,403);assert.equal((await call('/admin/insights?from=2026-02-30')).status,422);assert.equal((await call('/admin/insights?from=2020-01-01&to=2026-01-01')).status,422);pass('analytics roles, organization and date guards');
 const path='/admin/teachers/'+scope.teacherProfileId+'/details',before=await call(path);assert.equal(before.status,200);const body={fullName:'测试教师新姓名',remark:'合成测试备注',expectedVersion:before.data.version},idem=randomUUID();const saved=await call(path,admin,body,idem);assert.equal(saved.status,200,JSON.stringify(saved));assert.deepEqual((await call(path,admin,body,idem)).data,saved.data);assert.equal((await call(path)).data.remark,body.remark);assert.equal((await prisma.teacherProfile.findUniqueOrThrow({where:{id:scope.teacherProfileId}})).fullName,body.fullName);pass('teacher editing persisted and idempotent');
 assert.equal((await call(path,admin,body)).status,409);assert.equal((await call(path,teacher,body)).status,403);assert.equal((await call('/admin/teachers/'+scope.teacherCProfileId+'/details')).status,404);assert.equal((await call(path,admin,{...body,fullName:' ',expectedVersion:saved.data.version})).status,422);pass('teacher edit conflict, authorization and validation');
 const events=await prisma.$queryRaw`SELECT count(*)::int AS count FROM v81_events WHERE organization_id=${scope.organizationId}::uuid AND resource_id=${scope.teacherProfileId}::uuid AND resource_type='TEACHER_PROFILE'`;assert.equal(events[0].count,1);pass('teacher edit audit recorded exactly once');
 await prisma.v81AdminAccess.update({where:{userId:scope.adminUserId},data:{kind:'SUB',permissions:['USER_ACCOUNTS','COURSE_VIEW']}});assert.equal((await call('/admin/insights')).status,403);assert.equal((await call(path)).status,200);pass('subadmin analytics denied and account permission retained');
 await prisma.v81AdminAccess.update({where:{userId:scope.adminUserId},data:{kind:'SUPER',permissions:[]}});
 for(let i=0;i<26;i++)await seedSubmittedExerciseRecord(prisma,scope,'P'+i+'X','VALID',{actualSeconds:3600,maximumSeconds:null,configureCourse:false});
 const first=await call('/exercise-records?limit=25&page=1'),last=await call('/exercise-records?limit=25&page=2');assert.equal(first.meta.pagination.total,27);assert.equal(first.meta.pagination.totalPages,2);assert.equal(first.data.length,25);assert.equal(last.data.length,2);assert.equal(new Set([...first.data,...last.data].map(r=>r.id)).size,27);assert.equal((await call('/admin/insights')).data.summary.records,27);pass('multiple pages reconcile and dashboard includes off-page records');
 console.log(JSON.stringify({result:'PASS',checks,database:'isolated synthetic PostgreSQL',productionWrites:0}));
}finally{child.kill();await prisma.$disconnect();}
