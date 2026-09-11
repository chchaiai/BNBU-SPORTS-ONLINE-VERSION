import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, appendFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import pg from '../../backend/node_modules/pg/lib/index.js';
import { foundationEnvironment, TEST_PASSWORD } from '../../backend/test/helpers/test-environment.ts';
import { createTestPrisma, seedFoundationFixture } from '../../backend/test/helpers/database.ts';
import { seedExerciseSessionStudent } from '../../backend/test/helpers/exercise-session.ts';

const directory='/workspace/.browser-state',statePath=directory+'/state.json';
mkdirSync(directory,{recursive:true,mode:0o700});
const state=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):{schemaVersion:1,database:'v81_browser_test',bootstrapped:false};
if(state.schemaVersion!==1 || state.database!=='v81_browser_test')throw new Error('Browser fixture state does not match the dedicated database');
const database=new URL('postgresql://sql-postgres:5432/v81_browser_test');
database.username=process.env.PGUSER;database.password=process.env.PGPASSWORD;
const environment=foundationEnvironment(database.href,3199);
environment.RUNTIME_LOG_DIRECTORY=directory+'/http-logs';
environment.LOG_LEVEL='info';
mkdirSync(environment.RUNTIME_LOG_DIRECTORY,{recursive:true,mode:0o700});
environment.PUBLIC_ORGANIZATION_CODE='BNBU';
const save=()=>{writeFileSync(statePath+'.tmp',JSON.stringify(state,null,2)+'\n',{mode:0o600});renameSync(statePath+'.tmp',statePath);};
if(!state.secrets){
  state.secrets=Object.fromEntries(['TOKEN_SIGNING_KEY','TOKEN_VERIFYING_KEY'].map(k=>[k,environment[k]]));
  for(const key of ['IDEMPOTENCY_ENCRYPTION_KEY','QR_JOIN_TOKEN_HASH_KEY','QR_JOIN_SECRET_ENCRYPTION_KEY','PUSH_TOKEN_ENCRYPTION_KEY'])state.secrets[key]=randomBytes(32).toString('base64');
  state.secrets.SECURITY_HASH_KEY=randomBytes(48).toString('base64');save();
}
Object.assign(environment,state.secrets,{APP_VERSION:'v81-local-browser',ACCESS_TOKEN_TTL:'900',REFRESH_TOKEN_ABSOLUTE_TTL:'86400',REFRESH_TOKEN_IDLE_TTL:'7200',
  CORS_ALLOWLIST:'http://127.0.0.1:4274,http://localhost:4274,http://127.0.0.1:3300,http://localhost:3300',
  REQUEST_BODY_LIMIT_BYTES:'2097152',EMAIL_DELIVERY_PROVIDER:'SMTP',EMAIL_DELIVERY_REQUIRED:'true',SMTP_HOST:'mailpit',SMTP_PORT:'1025',SMTP_SECURE:'false',
  SMTP_FROM_ADDRESS:'test@bnbu.invalid',MEDIA_STORAGE_ENDPOINT:'http://media-minio:9000',MEDIA_STORAGE_PUBLIC_ENDPOINT:'http://127.0.0.1:19000',
  MEDIA_STORAGE_ACCESS_KEY:'v81-local-media',MEDIA_STORAGE_SECRET_KEY:process.env.PGPASSWORD,MEDIA_WORKER_ENABLED:'true',
  OBJECT_STORAGE_ENDPOINT:'http://media-minio:9000',OBJECT_STORAGE_REGION:'us-east-1',OBJECT_STORAGE_BUCKET:'synthetic-media-private',
  OBJECT_STORAGE_FORCE_PATH_STYLE:'true',OBJECT_STORAGE_ACCESS_KEY:'v81-local-media',OBJECT_STORAGE_SECRET_KEY:process.env.PGPASSWORD,
  OCR_PROVIDER:'DISABLED',OCR_WORKER_ENABLED:'false'});
const redact=text=>String(text).replaceAll(database.href,'[LOCAL_BROWSER_DATABASE]').replaceAll(process.env.PGPASSWORD,'[LOCAL_STORAGE_SECRET]');
const bootstrap=new pg.Client({host:'sql-postgres',database:'v81_sql_probe',user:process.env.PGUSER,password:process.env.PGPASSWORD});
await bootstrap.connect();
try{if(!(await bootstrap.query("SELECT 1 FROM pg_database WHERE datname='v81_browser_test'")).rowCount)await bootstrap.query('CREATE DATABASE v81_browser_test');}
finally{await bootstrap.end();}
const require=createRequire(new URL('../../backend/package.json',import.meta.url));
const {S3Client,HeadBucketCommand,CreateBucketCommand}=require('@aws-sdk/client-s3');
const storage=new S3Client({endpoint:environment.MEDIA_STORAGE_ENDPOINT,region:'us-east-1',forcePathStyle:true,
  credentials:{accessKeyId:environment.MEDIA_STORAGE_ACCESS_KEY,secretAccessKey:environment.MEDIA_STORAGE_SECRET_KEY}});
try{try{await storage.send(new HeadBucketCommand({Bucket:environment.MEDIA_STORAGE_BUCKET}));}
  catch(error){if(error.$metadata?.httpStatusCode!==404)throw error;await storage.send(new CreateBucketCommand({Bucket:environment.MEDIA_STORAGE_BUCKET}));}}
finally{storage.destroy();}
const migrate=spawn(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env:environment,stdio:['ignore','pipe','pipe']});
for(const stream of [migrate.stdout,migrate.stderr])stream.on('data',chunk=>process.stdout.write(redact(chunk)));
if(await new Promise((resolve,reject)=>{migrate.once('error',reject);migrate.once('exit',resolve);})!==0)throw new Error('Browser database migration failed');
const prisma=createTestPrisma(database.href);
try{
  if(!state.fixture){
    state.fixture=await seedFoundationFixture(prisma,randomUUID().slice(0,8).toUpperCase());save();
    await prisma.organization.update({where:{id:state.fixture.organizationId},data:{organizationCode:'BNBU'}});
    await prisma.$executeRaw`INSERT INTO v81_admin_access(user_id,organization_id,kind) VALUES(${state.fixture.adminUserId}::uuid,${state.fixture.organizationId}::uuid,'SUPER')`;
    state.student=await seedExerciseSessionStudent(prisma,state.fixture,randomUUID().slice(0,8).toUpperCase());
    await prisma.classSection.update({where:{id:state.fixture.teacherAActiveSectionId},data:{dailyStartTime:new Date('1970-01-01T00:00:00Z'),dailyEndTime:new Date('1970-01-01T23:59:59Z')}});
    state.accounts={admin:{email:state.fixture.adminEmail,password:'Browser-'+randomUUID()+'A7!'},teacher:{email:state.fixture.teacherEmail,password:'Browser-'+randomUUID()+'A7!'},student:{email:state.student.email}};
    save();
  }
}finally{await prisma.$disconnect();}
const syntheticOcr=process.env.LOCAL_BROWSER_OCR_SYNTHETIC==='1';
if(syntheticOcr)Object.assign(environment,{LOCAL_BROWSER_OCR_SYNTHETIC:'1',OCR_PROVIDER:'TENCENT_TABLE_V3',OCR_TENCENT_REGION:'ap-guangzhou',OCR_WORKER_ENABLED:'true'});
const child=spawn(process.execPath,[...(syntheticOcr?['--import','/workspace/tools/local-integration/v81-browser-ocr-provider.mjs']:[]),'dist/main.js'],{env:environment,stdio:['ignore','pipe','pipe']});
let terminal=false;child.once('exit',()=>{terminal=true;});
for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{
  if(stream===child.stdout)appendFileSync(directory+'/runtime-debug.ndjson',chunk,{mode:0o600});
  process.stdout.write(redact(chunk));
});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
const base='http://127.0.0.1:3199/api/v1';
const request=async(path,token,body)=>{const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','idempotency-key':randomUUID(),...(token?{authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json();if(!response.ok)throw Object.assign(new Error(`${path}: HTTP ${response.status} ${result.code??''}`),{httpStatus:response.status});return result.data;};
try{
  let ready=false;
  for(let i=0;i<90;i++){if(terminal)throw new Error('Browser backend exited before readiness');try{ready=(await fetch(base+'/health/ready')).ok;}catch{}if(ready)break;await delay(500);}
  if(!ready)throw new Error('Browser backend readiness timeout');
  if(!state.bootstrapped){
    const tokens={};
    for(const role of ['admin','teacher']){
      const account=state.accounts[role];let login;
      try{login=await request('/auth/password-login',null,{account:account.email,password:account.password});}
      catch(error){if(error.httpStatus!==401)throw error;login=await request('/auth/password-login',null,{account:account.email,password:TEST_PASSWORD});
        const security=await request('/auth/account-security',login.accessToken);
        await request('/auth/own-password',login.accessToken,{currentPassword:TEST_PASSWORD,newPassword:account.password,confirmPassword:account.password,expectedVersion:security.version});}
      tokens[role]=(await request('/auth/password-login',null,{account:account.email,password:account.password})).accessToken;
    }
    const templates=await request('/rule-templates',tokens.admin);
    const template=templates.items[0]??await request('/rule-templates',tokens.admin,{displayName:'Synthetic browser manual-review template',expectedVersion:0});
    const rulePath=`/class-sections/${state.fixture.teacherAActiveSectionId}/v81-rules`;
    let existing={version:0,published_at:null};
    try{existing=await request(rulePath,tokens.teacher);}catch(error){if(error.httpStatus!==404)throw error;}
    if(!existing.published_at)await request(rulePath,tokens.teacher,{minimumMinutes:30,weeklyLimit:3,courseTarget:600,generalTarget:600,
      regularDeadline:'2027-01-23T00:00:00Z',closingDeadline:'2027-01-30T00:00:00Z',settlementPlannedAt:'2027-01-30T01:00:00Z',publish:true,
      expectedVersion:existing.version??0,templateId:template.id});
    const manual=await request(`/admin/review-services/manual-mode/${state.fixture.teacherAActiveSectionId}`,tokens.admin);
    if(!manual.enabled)await request('/admin/review-services/manual-mode',tokens.admin,{classSectionId:state.fixture.teacherAActiveSectionId,enabled:true,reason:'Synthetic local browser manual verification',expectedVersion:manual.version});
    state.bootstrapped=true;save();
    writeFileSync(directory+'/ACCOUNTS.local.md',`# 本地合成测试账号\n\n仅用于 v81_browser_test，不是真实学校数据。\n\n管理员邮箱：${state.accounts.admin.email}\n密码：${state.accounts.admin.password}\n\n教师邮箱：${state.accounts.teacher.email}\n密码：${state.accounts.teacher.password}\n\n学生邮箱：${state.accounts.student.email}\n学生通过当前邮箱验证码登录；邮件查看：http://127.0.0.1:18025\n\n组织代码：BNBU\n`,{mode:0o600});
  }
  console.log(JSON.stringify({check:'PERSISTENT_BROWSER_BACKEND_READY',database:state.database,syntheticFixture:true,manualReview:true,port:3199}));
  if(!terminal)await new Promise(resolve=>child.once('exit',resolve));
}catch(error){console.error(redact(error.message));child.kill('SIGTERM');process.exitCode=1;}
