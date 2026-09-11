import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {Readable} from 'node:stream';
import {createTestPrisma} from '../../backend/test/helpers/database.ts';
import {foundationEnvironment} from '../../backend/test/helpers/test-environment.ts';
import {validateEnvironment} from '../../backend/src/common/config/environment.ts';
import {MediaValidator} from '../../backend/src/modules/media/application/media-validator.ts';
const require=createRequire(new URL('../../backend/package.json',import.meta.url));
const {S3Client,GetObjectCommand}=require('@aws-sdk/client-s3');
const url=new URL('postgresql://sql-postgres:5432/v81_browser_test');url.username=process.env.PGUSER;url.password=process.env.PGPASSWORD;
const prisma=createTestPrisma(url.href);
try{
 assert.equal((await prisma.$queryRaw`SELECT current_database() AS name`)[0].name,'v81_browser_test');
 const row=await prisma.mediaEvidence.findFirstOrThrow({where:process.env.V81_UPLOAD_ID?{uploadSession:{id:process.env.V81_UPLOAD_ID}}:{sessionId:'01a08aa4-3a90-77dc-93fc-268e595926d5',mediaType:'VIDEO'},orderBy:{createdAt:'desc'}});
 const record=await prisma.exerciseRecord.findFirstOrThrow({where:{sessionId:row.sessionId}});
 const photos=await prisma.mediaEvidence.findMany({where:{sessionId:row.sessionId,mediaType:'IMAGE',uploadStatus:'AVAILABLE'},select:{id:true}});
 if(!process.env.V81_UPLOAD_ID)fs.writeFileSync('/workspace/.browser-state/bugfix-video-recovery.json',JSON.stringify({recordId:record.id,sessionId:row.sessionId,photoIds:photos.map(item=>item.id),actualDurationSeconds:1813,expectedHours:0.5}));
 const client=new S3Client({endpoint:'http://media-minio:9000',region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:'v81-local-media',secretAccessKey:process.env.PGPASSWORD}});
 const object=await client.send(new GetObjectCommand({Bucket:'synthetic-media-private',Key:row.storageKey}));
 const bytes=process.env.V81_VIDEO_FINALIZED==='1'?fs.readFileSync('/workspace/.browser-state/bugfix-captured-video-finalized.webm'):Buffer.from(await object.Body.transformToByteArray());
 if(process.env.V81_VIDEO_FINALIZED!=='1')fs.writeFileSync('/workspace/.browser-state/'+(process.env.V81_UPLOAD_ID?'bugfix-failed-native.mp4':'bugfix-captured-video.webm'),bytes);
 const declared={businessPurpose:row.businessPurpose,mediaType:row.mediaType,mimeType:row.declaredMimeType,fileSizeBytes:Number(row.declaredFileSizeBytes),contentSha256:row.declaredContentSha256,durationSeconds:row.declaredDurationSeconds};
 if(process.env.V81_VIDEO_FINALIZED==='1'){declared.fileSizeBytes=bytes.length;declared.contentSha256=createHash('sha256').update(bytes).digest('hex');}
 console.log(JSON.stringify({declared,actual:{bytes:bytes.length,contentType:object.ContentType,sha256:createHash('sha256').update(bytes).digest('hex'),head:bytes.subarray(0,48).toString('hex')}}));
 try{console.log(await new MediaValidator().readAndVerify(Readable.from(bytes),declared,validateEnvironment(foundationEnvironment(url.href,3199)).RUNTIME_CONFIG.media));}catch(error){console.log(JSON.stringify({code:error.code,stack:error.stack}));process.exitCode=1;}
}finally{await prisma.$disconnect();}
