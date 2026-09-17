import 'reflect-metadata';
import {execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {S3Client,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {loadRuntimeSecrets} from './dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from './dist/common/config/environment.js';
import {storageCredentials} from './dist/common/object-storage/tencent-cvm-role-credential-provider.js';
import {S3MediaStorageAdapter} from './dist/common/object-storage/s3-media-storage.adapter.js';
import {MediaValidator} from './dist/modules/media/application/media-validator.js';
import {normalizeServerVideo,processedVideoKey} from './dist/modules/media/application/video-normalizer.js';
await loadRuntimeSecrets(process.env);
const runtime=validateEnvironment(process.env).RUNTIME_CONFIG;
const config=runtime.media,adapter=new S3MediaStorageAdapter(runtime);
const key=`media/00000000-0000-4000-8000-000000000079/${randomUUID()}/video`;
const directory=await mkdtemp(join(tmpdir(),'video-live-check-'));
const client=new S3Client({endpoint:config.storage.endpoint,region:config.storage.region,forcePathStyle:config.storage.forcePathStyle,credentials:storageCredentials(config.storage.credentials)});
let result;
try {
  const file=join(directory,'synthetic.mp4');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=30','-f','lavfi','-i','sine=frequency=440','-t','2','-c:v','libx264','-threads','1','-c:a','aac',file],{timeout:30000});
  const bytes=await readFile(file);
  const transport=await adapter.createUploadUrl({storageKey:key,contentType:'video/mp4',contentLength:bytes.length,expiresInSeconds:300});
  const upload=await fetch(transport.url,{method:'PUT',headers:transport.requiredHeaders,body:bytes,signal:AbortSignal.timeout(60000)});
  if(!upload.ok)throw Error('Synthetic COS upload failed: '+upload.status);
  const verified=await normalizeServerVideo(adapter,key,{businessPurpose:'EXERCISE_RECORD',mediaType:'VIDEO',mimeType:'video/mp4',fileSizeBytes:bytes.length,contentSha256:createHash('sha256').update(bytes).digest('hex'),durationSeconds:null},config,new MediaValidator());
  const head=await adapter.headPrivateObject(processedVideoKey(key));
  if(head.contentLength!==verified.fileSizeBytes||verified.mimeType!=='video/mp4'||verified.durationSeconds>10)throw Error('Synthetic normalized COS facts mismatch');
  result={result:'PASS',scope:'Synthetic COS objects and real production scanner/FFmpeg; no database or student record writes',bytes:verified.fileSizeBytes,duration:verified.durationSeconds,normalized:verified.safeMetadata.normalized};
} finally {
  for(const storageKey of [key,processedVideoKey(key)])await client.send(new DeleteObjectCommand({Bucket:config.storage.bucket,Key:storageKey}));
  client.destroy();adapter.onModuleDestroy();await rm(directory,{recursive:true,force:true});
}
console.log(JSON.stringify({...result,syntheticObjectsRemoved:true}));
