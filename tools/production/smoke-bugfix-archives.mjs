// Run only after the locally validated release is deployed. All writes belong
// to a newly inserted synthetic organization; never use real school accounts.
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {v7 as uuidv7} from 'uuid';
import {seedFoundationFixture} from '/app/production-smoke-helpers.mjs';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
import {TokenService} from '/app/dist/modules/auth/token.service.js';
await loadRuntimeSecrets(process.env);
const config=validateEnvironment(process.env).RUNTIME_CONFIG;
const db=new PrismaService(config), results=[];
let fixture;
try {
 fixture=await seedFoundationFixture(db,'-BUGZIP-'+Date.now().toString(36).toUpperCase());
 await db.v81AccountSecurity.create({data:{userId:fixture.adminUserId,organizationId:fixture.organizationId,mustChangePassword:false,passwordChangedAt:new Date()}});
 const now=new Date(),sessionId=uuidv7();
 await db.authSession.create({data:{id:sessionId,organizationId:fixture.organizationId,userId:fixture.adminUserId,status:'ACTIVE',tokenFamilyId:uuidv7(),createdAt:now,lastSeenAt:now,absoluteExpiresAt:new Date(+now+3600000),idleExpiresAt:new Date(+now+3600000)}});
 await db.$executeRaw`INSERT INTO v81_admin_access(user_id,organization_id,kind,permissions,must_change_password) VALUES(${fixture.adminUserId}::uuid,${fixture.organizationId}::uuid,'SUB','["AUDIT_QUERY"]'::jsonb,false)`;
 const issuer=new TokenService(config,{now:()=>new Date()},{next:uuidv7});
 const {token}=await issuer.issue({userId:fixture.adminUserId,organizationId:fixture.organizationId,role:'ADMIN',sessionId,tokenVersion:0});
 const origin=process.env.BNBU_SMOKE_ORIGIN??'https://www.teacher.bnbusports.cn';
 assert.ok(['https://www.teacher.bnbusports.cn','http://127.0.0.1:3199'].includes(origin));
 const request=async(path,body,key=randomUUID())=>{
  const response=await fetch(origin+'/api/v1'+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':key},...(body?{body:JSON.stringify(body)}:{})});
  const value=await response.json();assert.ok(response.ok,JSON.stringify({path:path.split('?')[0],status:response.status,code:value.code,requestId:value.requestId}));return value.data;
 };
 await request('/me'); // Produce an actual scoped HTTP diagnostic before requesting the archive.
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const key=randomUUID(),input={startDate:date,endDate:date};
 const job=await request('/admin/runtime-archives',input,key);
 assert.equal((await request('/admin/runtime-archives',input,key)).id,job.id);
 let complete;
 for(let attempt=0;attempt<60;attempt++){
  complete=await request(`/admin/runtime-archives/${job.id}`);
  if(['SUCCEEDED','FAILED'].includes(complete.status))break;
  await delay(1000);
 }
 assert.equal(complete.status,'SUCCEEDED',JSON.stringify({status:complete.status,failureCode:complete.failureCode}));
 assert.ok(complete.recordCount>0);
 const capability=await request(`/admin/runtime-archives/${job.id}/download-url`,{expectedVersion:complete.version});
 assert.ok(capability.downloadUrl.startsWith(`/api/v1/admin/runtime-archives/${job.id}/content?`));
 const denied=await fetch(origin+capability.downloadUrl);assert.equal(denied.status,401);
 const download=await fetch(origin+capability.downloadUrl,{headers:{authorization:`Bearer ${token}`}});assert.equal(download.status,200);
 const bytes=Buffer.from(await download.arrayBuffer());assert.equal(bytes.length,complete.byteLength);assert.equal(createHash('sha256').update(bytes).digest('hex'),complete.sha256);assert.equal(bytes.subarray(0,2).toString(),'PK');
 results.push({check:'PRODUCTION_SCOPED_RUNTIME_ZIP_REPLAY_COS_WORKER_AUTH_DOWNLOAD_DIGEST',status:'PASS',archiveId:job.id,bytes:bytes.length,records:complete.recordCount,coverage:complete.coverage});
} finally {
 if(fixture){
  await db.user.updateMany({where:{organizationId:{in:[fixture.organizationId,fixture.isolationOrganizationId]}},data:{status:'DISABLED',tokenVersion:{increment:1}}});
  results.push({check:'SYNTHETIC_ARCHIVE_ACCOUNTS_DISABLED',status:'PASS',organizationId:fixture.organizationId});
 }
 await db.$disconnect();console.log(JSON.stringify(results));
}
