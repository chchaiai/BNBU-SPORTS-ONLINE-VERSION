// Real COS and elapsed upload expiry, scoped solely to the DEMAND16 synthetic organization.
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {randomUUID,createHash} from 'node:crypto';
const f=JSON.parse(await fs.readFile('.local/demand-20260916-private.json','utf8')),checks=[];
const require=createRequire(new URL('../../backend/package.json',import.meta.url)),sharp=require('sharp');
const base='https://www.student.bnbusports.cn/api/v1';let a,s=f.studentSession.accessToken,t,maintenance=false,maintenanceVersion;
async function api(path,token,body,status=path=='/system-mode/changes'?201:200){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','idempotency-key':randomUUID(),...(token?{authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const v=await r.json();assert.equal(r.status,status,JSON.stringify({path,status:r.status,code:v.code,requestId:v.requestId}));return status>=400?v:v.data;}
async function normal(){await api('/system-mode/changes',a,{mode:'NORMAL',reason:'Synthetic demand recovery completed',expectedVersion:maintenanceVersion});maintenance=false;}
try{
 a=(await api('/auth/password-login',null,{account:f.accounts.admin.email,password:f.accounts.admin.password})).accessToken;
 t=(await api('/auth/password-login',null,{account:f.accounts.teacher.email,password:f.accounts.teacher.password})).accessToken;
 const fresh=await api('/auth/refresh',null,{refreshToken:f.studentSession.refreshToken}); f.studentSession={...f.studentSession,...fresh};s=fresh.accessToken;await fs.writeFile('.local/demand-20260916-private.json',JSON.stringify(f));
 for(const token of [a,s,t])assert.equal((await api('/me',token)).user.organizationId,f.fixture.organizationId);
 let session=await api('/exercise-sessions/active',s);
 const bytes=await sharp({create:{width:32,height:32,channels:3,background:'#338866'}}).png().toBuffer();
 const upload=await api('/media-uploads',s,{sessionId:session.id,businessPurpose:'EXERCISE_RECORD',mediaType:'IMAGE',mimeType:'image/png',fileSizeBytes:bytes.length,captureSource:'IN_APP_CAMERA',declaredContentSha256:createHash('sha256').update(bytes).digest('hex')},201);
 const put=await fetch(upload.uploadUrl,{method:upload.uploadMethod,headers:upload.requiredHeaders,body:bytes,signal:AbortSignal.timeout(30000)});assert.equal(put.status,200);
 const etag=put.headers.get('etag').replaceAll('"','');const started=Date.now();
 const publicBefore=await api('/system-mode',null);const history=await api('/system-mode/history',a);const mode={policyVersion:history[0]?.version??1};const changed=await api('/system-mode/changes',a,{mode:'MAINTENANCE',reason:'Synthetic demand isolated upload expiry acceptance',expectedVersion:mode.policyVersion,titleZh:'合成组织维护验收',titleEn:'Synthetic organization maintenance',bodyZh:'测试组织内保留原上传',bodyEn:'Retain the original upload in the synthetic organization',estimatedRecoveryAt:new Date(Date.now()+600000).toISOString()});maintenance=true;maintenanceVersion=changed.policyVersion;assert.deepEqual(await api('/system-mode',null),publicBefore);
 const denied=await api('/media-uploads/'+upload.uploadSessionId+'/confirm',s,{etag},503);assert.equal(denied.code,'SYSTEM_MAINTENANCE');
 checks.push({stage:'UPLOADED_THEN_MAINTENANCE',status:'PASS',mediaId:upload.mediaId,sessionId:session.id});console.log(JSON.stringify(checks.at(-1)));
 // No clock override: leave the existing object in COS past its 300-second PUT lifetime.
 while(Date.now()-started<305000)await new Promise(resolve=>setTimeout(resolve,Math.min(30000,305000-(Date.now()-started))));
 await normal();
 const confirmed=await api('/media-uploads/'+upload.uploadSessionId+'/confirm',s,{etag});
 await api('/media/'+upload.mediaId+'/bind',s,{sessionId:session.id,expectedVersion:confirmed.version});
 let media;for(let i=0;i<60;i++){media=await api('/media/'+upload.mediaId,s);if(media.uploadStatus==='AVAILABLE')break;assert.notEqual(media.uploadStatus,'FAILED');await new Promise(r=>setTimeout(r,1000));}assert.equal(media.uploadStatus,'AVAILABLE');
 session=await api('/exercise-sessions/'+session.id,s);session=await api('/exercise-sessions/'+session.id+'/finish',s,{expectedVersion:session.version,clientObservedAt:new Date().toISOString()});
 const record=await api('/exercise-records',s,{sessionId:session.id,creditType:'GENERAL',sportType:'RUNNING',description:'Synthetic maintenance recovery after real COS capability expiry',clientRequestId:randomUUID()},201);
 const submitted=await api('/exercise-records/'+record.id+'/submit',s,{mediaIds:[upload.mediaId],expectedVersion:record.version});
 checks.push({requirement:[17,20,16],result:'PASS',elapsedSeconds:Math.floor((Date.now()-started)/1000),realCosPuts:1,mediaId:upload.mediaId,recordId:record.id,submissionStatus:submitted.status});
}finally{
 if(maintenance)await normal();
 await fs.writeFile('evidence/demand-20260916/online/recovery-result.json',JSON.stringify({checks,completed:checks.some(x=>x.result==='PASS')},null,2));
}
