import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
import {randomUUID} from 'node:crypto';
import {foundationEnvironment,TEST_PASSWORD} from '../../backend/test/helpers/test-environment.ts';
import {createTestPrisma,resetFoundationDatabase,seedFoundationFixture} from '../../backend/test/helpers/database.ts';
import {seedExerciseSessionStudent} from '../../backend/test/helpers/exercise-session.ts';

// Dedicated disposable browser database. Never accept a production URL as input.
const databaseUrl='postgresql://bnbu_test:demand-local-test-only@127.0.0.1:55433/bnbu_sports_test?schema=public';
process.env.TEST_DATABASE_URL=databaseUrl;
process.env.TEST_DATABASE_RESET_CONFIRMATION='BNBU_SPORTS_EPHEMERAL_TEST_DATABASE_V1';
const prisma=createTestPrisma(databaseUrl);
const previous=process.env.DEMAND_BROWSER_REUSE==='1'?JSON.parse(await fs.readFile('evidence/demand-20260916/browser/state.json','utf8')):null;
let fixture,student;
if(previous){fixture=previous.fixture;student=previous.student;}else{
await resetFoundationDatabase(prisma);
fixture=await seedFoundationFixture(prisma);
student=await seedExerciseSessionStudent(prisma,fixture,'DEMAND-BROWSER');
await prisma.studentProfile.update({where:{id:student.studentId},data:{majorName:'未分流'}});
await prisma.v81AccountSecurity.createMany({data:[fixture.adminUserId,fixture.teacherUserId].map(userId=>({
  userId,organizationId:fixture.organizationId,mustChangePassword:false,passwordChangedAt:new Date()}))});
await prisma.v81AdminAccess.create({data:{userId:fixture.adminUserId,organizationId:fixture.organizationId,kind:'SUPER',permissions:[],mustChangePassword:false}});
await prisma.classSection.update({where:{id:fixture.teacherAActiveSectionId},data:{dailyStartTime:new Date('1970-01-01T00:00:00Z'),dailyEndTime:new Date('1970-01-01T23:59:59Z')}});
}
const require=createRequire(new URL('../../backend/package.json',import.meta.url));
const {S3Client,CreateBucketCommand}=require('@aws-sdk/client-s3');
const media=new S3Client({endpoint:'http://127.0.0.1:59000',region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:'demand-local-test',secretAccessKey:'demand-local-test-secret-only'}});
try{await media.send(new CreateBucketCommand({Bucket:'demand-browser'}));}catch(error){if(!['BucketAlreadyOwnedByYou','BucketAlreadyExists'].includes(error.name))throw error;}finally{media.destroy();}
const env={...foundationEnvironment(databaseUrl,53001),ACCESS_TOKEN_TTL:'900',REFRESH_TOKEN_IDLE_TTL:'1800',
  PUBLIC_ORGANIZATION_CODE:'BNBU-TEST',
  CORS_ALLOWLIST:'http://127.0.0.1:53000',REQUEST_BODY_LIMIT_BYTES:'2097152',
  EMAIL_DELIVERY_PROVIDER:'SMTP',EMAIL_DELIVERY_REQUIRED:'true',SMTP_HOST:'127.0.0.1',SMTP_PORT:'51025',SMTP_FROM_ADDRESS:'test@bnbu.invalid',SMTP_SECURE:'false',
  MEDIA_STORAGE_ENDPOINT:'http://127.0.0.1:59000',MEDIA_STORAGE_ACCESS_KEY:'demand-local-test',MEDIA_STORAGE_SECRET_KEY:'demand-local-test-secret-only',MEDIA_STORAGE_BUCKET:'demand-browser',MEDIA_WORKER_ENABLED:'true'};
const backend=spawn(process.execPath,['dist/main.js'],{cwd:path.resolve('backend'),env,stdio:['ignore','inherit','inherit'],windowsHide:true});
let live=false;for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:53001/api/v1/health/live')).ok){live=true;break;}}catch{}await delay(200);}
if(!live)throw new Error('Dedicated browser backend did not start');
async function request(route,token,body){const response=await fetch('http://127.0.0.1:53001/api/v1'+route,{method:body?'POST':'GET',headers:{'content-type':'application/json','idempotency-key':randomUUID(),...(token?{authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw new Error(JSON.stringify(result));return result.data;}
if(!previous){
const admin=await request('/auth/password-login',null,{account:fixture.adminEmail,password:TEST_PASSWORD});
const teacher=await request('/auth/password-login',null,{account:fixture.teacherEmail,password:TEST_PASSWORD});
const template=await request('/rule-templates',admin.accessToken,{displayName:'Demand browser rules',expectedVersion:0});
await request(`/class-sections/${fixture.teacherAActiveSectionId}/v81-rules`,teacher.accessToken,{templateId:template.id,minimumMinutes:30,weeklyLimit:3,courseTarget:600,generalTarget:600,publish:true,expectedVersion:0});
}
const organization=await prisma.organization.findUniqueOrThrow({where:{id:fixture.organizationId}});
await fs.mkdir('evidence/demand-20260916/browser',{recursive:true});
await fs.writeFile('evidence/demand-20260916/browser/state.json',JSON.stringify({fixture,student,organizationCode:organization.organizationCode,baseUrl:'http://127.0.0.1:53000'},null,2));
await prisma.$disconnect();
const root=path.resolve('BNBU-Sports-Web-new/frontend');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.woff2':'font/woff2'};
const proxy=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:53000');
  if(url.pathname==='/runtime-config.js'){res.writeHead(200,{'content-type':'text/javascript','cache-control':'no-store'}).end('globalThis.__BNBU_PUBLIC_CONFIG__=Object.freeze({appEnv:"test"});');return;}
  if(url.pathname.startsWith('/student')){
    const file=path.resolve(root,'.'+(url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    try{const bytes=await fs.readFile(file);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'}).end(bytes);}catch{res.writeHead(404).end();}return;
  }
  const isMedia=url.pathname.startsWith('/minio/');
  const upstream=http.request({hostname:'127.0.0.1',port:isMedia?59000:url.pathname.startsWith('/api/')?53001:53002,path:isMedia?req.url.slice('/minio'.length):req.url,method:req.method,headers:{...req.headers,host:isMedia?'127.0.0.1:59000':'127.0.0.1:53000'}},incoming=>{res.writeHead(incoming.statusCode,incoming.headers);incoming.pipe(res);});
  upstream.on('error',()=>{res.writeHead(502).end('Local preview is starting');});req.pipe(upstream);
});
proxy.listen(53000,'127.0.0.1',()=>console.log('Demand browser environment ready: http://127.0.0.1:53000'));
process.on('SIGINT',()=>{backend.kill();proxy.close();});
