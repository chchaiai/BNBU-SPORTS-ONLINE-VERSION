import 'reflect-metadata';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {computeCredits} from './dist/modules/v8/credit-computation.js';
import {normalizeServerVideo,checkVideoWorkspace,processedVideoKey} from './dist/modules/media/application/video-normalizer.js';
import {MediaValidator} from './dist/modules/media/application/media-validator.js';
for(const name of ['modules/auth/auth.service.js','modules/exercise-records/application/exercise-records.service.js','modules/exercise-sessions/interface/http/exercise-sessions.controller.js','modules/media/application/media-processing.worker.js'])await import('./dist/'+name);
await checkVideoWorkspace();
const performanceRows=[];
for(const n of [10,30,60,120]){
 const rows=Array.from({length:n},(_,i)=>{const date=new Date(Date.UTC(2026,8,1+i)).toISOString().slice(0,10);return {id:`r${i}`,category:i%2?'GENERAL':'COURSE_RELATED',startedAt:`${date}T10:00:00Z`,businessDate:date,actualSeconds:(30+i*17%31)*60,valid:true,previouslySelected:false,maximumMinutes:60};});
 const start=performance.now();let delay;const timer=new Promise(r=>setTimeout(()=>{delay=performance.now()-start;r();},0));
 const result=await computeCredits(rows,{minimumMinutes:30,weeklyLimit:3,dailyLimit:1,courseTarget:600,generalTarget:600});await timer;
 assert.equal(result.totalMinutes,n===10?307:n===30?790:1200);performanceRows.push({n,elapsedMs:performance.now()-start,eventLoopDelayMs:delay});
}
const directory=await mkdtemp(join(process.env.MEDIA_WORK_DIRECTORY,'deep-review-probe-'));let server;
try{
 const source=join(directory,'source.mp4');
 await promisify(execFile)('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c=black:s=640x480:r=30','-f','lavfi','-i','sine=frequency=1000:sample_rate=48000','-t','9','-vf','noise=alls=100:allf=t+u','-c:v','libx264','-threads','1','-filter_threads','1','-preset','ultrafast','-crf','0','-c:a','aac','-movflags','+faststart',source],{timeout:120000,maxBuffer:1024*1024});
 const size=(await stat(source)).size;assert.ok(size>64*1024*1024 && size<200*1024*1024,`source bytes ${size}`);
 const hash=createHash('sha256');for await(const chunk of createReadStream(source))hash.update(chunk);
 let uploaded=0;
 server=createServer(async(req,res)=>{for await(const chunk of req)uploaded+=chunk.length;res.writeHead(200).end();});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const storage={getPrivateObject:async()=>createReadStream(source),createUploadUrl:async(input)=>{assert.equal(input.storageKey,'synthetic/normalized-2.mp4');return {url:`http://127.0.0.1:${server.address().port}/upload`,requiredHeaders:{'content-type':'video/mp4'}};}};
 const config={maxVideoTransportBytes:200*1024*1024,maxImageBytes:10*1024*1024,maxImagePixels:40000000,scannerMode:'TEST_SIGNATURE'};
 const verified=await normalizeServerVideo(storage,'synthetic',{businessPurpose:'EXERCISE_RECORD',mediaType:'VIDEO',mimeType:'video/mp4',fileSizeBytes:size,contentSha256:hash.digest('hex'),durationSeconds:9},config,new MediaValidator(),2);
 assert.equal(verified.safeMetadata.normalizationAttempt,2);assert.equal(uploaded,verified.fileSizeBytes);assert.equal(processedVideoKey('synthetic',verified.safeMetadata),'synthetic/normalized-2.mp4');
 console.log(JSON.stringify({result:'PASS',node:process.version,performanceRows,sourceBytes:size,outputBytes:uploaded,actualNormalization:true,originalRetained:(await stat(source)).size===size}));
}finally{await new Promise(r=>server?server.close(r):r());await rm(directory,{recursive:true,force:true});}
