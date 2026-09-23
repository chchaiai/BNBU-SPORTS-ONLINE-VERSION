import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {createTestPrisma,seedFoundationFixture} from '../../backend/test/helpers/database.ts';
import {seedExerciseSessionStudent} from '../../backend/test/helpers/exercise-session.ts';

// This executable is bundled for an isolated PostgreSQL container without production secrets.
const {FeedbackAttachmentsService}=await import('/app/dist/modules/client-capabilities/feedback-attachments.js');
const {V81StudentMediaErasureWorker}=await import('/app/dist/modules/v8/v81-student-media-erasure.js');
const {ClientErrorReportInput,ClientErrorReportsController}=await import('/app/dist/modules/client-capabilities/client-error-reports.controller.js');
const {validate}=await import('class-validator');
assert.equal(process.env.DATABASE_URL,'postgresql://postgres@feedback-erasure-db:5432/feedback_erasure_test');
const db=createTestPrisma(process.env.DATABASE_URL);
const objects=new Map(),deleted=[];
let copyGate=null,invalid=false,deleteFails=false;
const storage={
 createUploadUrl:async()=>({url:'https://synthetic.invalid',method:'PUT',requiredHeaders:{}}),
 copyPrivateObject:async(source,target)=>{if(copyGate) await copyGate;objects.set(target,objects.get(source));},
 getPrivateObject:async(key)=>Readable.from([invalid?Buffer.from([0,0,0]):objects.get(key)]),
 deletePrivateObject:async(key)=>{if(deleteFails)throw Error('synthetic outage');objects.delete(key);deleted.push(key);}
};
const service=new FeedbackAttachmentsService(db,storage,{}),worker=new V81StudentMediaErasureWorker(db,storage);
const checks=[];function pass(name){checks.push(name);}
try {
 const scope=await seedFoundationFixture(db,'ERASE'+randomUUID().slice(0,6).toUpperCase());
 await db.v81AdminAccess.create({data:{userId:scope.adminUserId,organizationId:scope.organizationId,kind:'SUPER',permissions:[],mustChangePassword:false}});
 const a=await seedExerciseSessionStudent(db,scope,'A'+randomUUID());
 const b=await seedExerciseSessionStudent(db,scope,'B'+randomUUID());
 const principal=s=>({organizationId:scope.organizationId,userId:s.userId,sessionId:s.authSessionId,role:'STUDENT'});
 const p=principal(a),peer=principal(b);
 async function prepare(who=p){const r=await service.prepare(who,{fileName:'test.txt',size:3});const [row]=await db.$queryRaw`SELECT * FROM feedback_attachments WHERE id=${r.id}::uuid`;objects.set(row.upload_key,Buffer.from('abc'));return row;}
 async function erase(s){return db.$transaction(tx=>tx.$queryRaw`SELECT erase_v81_student(${scope.organizationId}::uuid,${s.studentId}::uuid,${scope.adminUserId}::uuid)`,{timeout:60000});}
 const bound=await prepare();await service.confirm(p,bound.id);
 const f=await db.feedback.create({data:{id:randomUUID(),organizationId:scope.organizationId,createdByUserId:a.userId,category:'BUG',content:'synthetic',status:'OPEN',version:1,createdAt:new Date(),updatedAt:new Date()}});
 await db.$transaction(tx=>service.bind(tx,p,f.id,[bound.id]));
 const unbound=await prepare(),other=await prepare(peer);await service.confirm(peer,other.id);
 const concurrent=await prepare();await Promise.all([service.confirm(p,concurrent.id),service.confirm(p,concurrent.id)]);
 assert.equal((await db.$queryRaw`SELECT * FROM feedback_object_cleanup`).length,1);
 await worker.processOne();
 const [winner]=await db.$queryRaw`SELECT storage_key FROM feedback_attachments WHERE id=${concurrent.id}::uuid`;
 assert.ok(objects.has(winner.storage_key));pass('concurrent confirmation keeps one accepted copy and removes loser');
 const failed=await prepare();invalid=true;await assert.rejects(service.confirm(p,failed.id));invalid=false;
 assert.equal((await db.$queryRaw`SELECT * FROM feedback_object_cleanup`).length,1);
 deleteFails=true;await worker.processOne();deleteFails=false;
 assert.equal((await db.$queryRaw`SELECT attempts FROM feedback_object_cleanup`)[0].attempts,1);
 await db.$executeRaw`UPDATE feedback_object_cleanup SET next_attempt_at=clock_timestamp()`;
 await worker.processOne();pass('scan failure cleanup survives storage outage and retries');
 const racing=await prepare();let release;copyGate=new Promise(resolve=>release=resolve);
 const pending=service.confirm(p,racing.id);const outcome=pending.then(()=>null,e=>e);
 for(let n=0;n<100;n++){if((await db.$queryRaw`SELECT * FROM feedback_object_cleanup`).length)break;await new Promise(r=>setTimeout(r,10));}
 const ownKeys=await db.$queryRaw`SELECT upload_key,storage_key FROM feedback_attachments WHERE owner_id=${a.userId}::uuid`;
 await erase(a);release();copyGate=null;assert.ok(await outcome);
 assert.equal((await db.$queryRaw`SELECT * FROM feedback_attachments WHERE owner_id=${a.userId}::uuid`).length,0);
 assert.equal(await db.feedback.count({where:{id:f.id}}),0);
 assert.equal(await db.user.count({where:{id:a.userId}}),0);
 assert.equal(await db.authSession.count({where:{userId:a.userId}}),0);
 assert.equal((await db.$queryRaw`SELECT * FROM feedback_attachments WHERE owner_id=${b.userId}::uuid`).length,1);
 pass('erasure removes bound and unbound attachments, feedback and sessions while preserving peer');
 await assert.rejects(service.prepare(p,{fileName:'late.txt',size:3}));pass('stale authenticated principal cannot recreate attachments');
 for(let n=0;n<40 && await worker.processOne();n++){}
 for(const row of ownKeys){assert.ok(!objects.has(row.upload_key));if(row.storage_key)assert.ok(!objects.has(row.storage_key));}
 assert.equal((await db.$queryRaw`SELECT * FROM feedback_object_cleanup`).length,0);
 assert.ok(objects.has(other.upload_key));pass('confirm versus erasure removes late COS copy');
 objects.set(unbound.upload_key,Buffer.from('abc'));
 await db.$executeRaw`UPDATE v81_student_media_erasure SET finalize_after=clock_timestamp(),next_attempt_at=clock_timestamp() WHERE deleted_at IS NULL`;
 for(let n=0;n<40 && await worker.processOne();n++){}
 assert.ok(!objects.has(unbound.upload_key));pass('old upload capability is followed by a second deletion');
 // Self-service authorization uses the same modified function and consumed challenge.
 const self=await seedExerciseSessionStudent(db,scope,'SELF'+randomUUID()),sp=principal(self);
 await prepare(sp);const challenge=randomUUID();
 await db.$executeRaw`INSERT INTO v81_account_deletion_challenges(id,organization_id,user_id,auth_session_id,expected_user_version,email_digest,code_digest,status,requested_at,expires_at,request_id)
 VALUES(${challenge}::uuid,${scope.organizationId}::uuid,${self.userId}::uuid,${self.authSessionId}::uuid,1,${'a'.repeat(64)},${'b'.repeat(64)},'CONSUMED',clock_timestamp(),clock_timestamp()+interval '10 minutes','synthetic')`;
 await db.$transaction(async tx=>{await tx.$queryRaw`SELECT set_config('bnbu.self_erasure_challenge',${challenge},true)`;await tx.$queryRaw`SELECT erase_v81_student(${scope.organizationId}::uuid,${self.studentId}::uuid,${self.userId}::uuid)`;},{timeout:60000});
 assert.equal(await db.user.count({where:{id:self.userId}}),0);pass('verified self-service erasure also handles attachments');
 for(const platform of ['IOS','ANDROID','WEB_STUDENT']){
   const body=Object.assign(new ClientErrorReportInput(),{platform,level:'ERROR',errorCode:'NETWORK_ERROR',category:'NETWORK',retryable:true,clientOccurredAt:new Date().toISOString()});
   assert.deepEqual(await validate(body),[]);
   let consumed=false;const controller=new ClientErrorReportsController({execute:async()=>({auditLogId:'synthetic'})},{},{},{consume:async()=>{consumed=true;return {allowed:true}}});
   await controller.report(peer,body,'synthetic',{});assert.ok(consumed);
   await assert.rejects(controller.report({...peer,role:'ADMIN'},body,'synthetic',{}));
 }
 pass('native student diagnostics accepted without permitting role impersonation');
 console.log(JSON.stringify({result:'PASS',checks,count:checks.length,productionDatabaseUsed:false}));
} finally {await db.$disconnect();}
