import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {S3Client,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {S3MediaStorageAdapter} from '/app/dist/common/object-storage/s3-media-storage.adapter.js';
import {storageCredentials} from '/app/dist/common/object-storage/tencent-cvm-role-credential-provider.js';
import {scannedMediaStream} from '/app/dist/modules/media/application/clamav-stream.js';
await loadRuntimeSecrets(process.env);const config=validateEnvironment(process.env).RUNTIME_CONFIG;
assert.equal(config.appEnvironment,'production');const storage=new S3MediaStorageAdapter(config),media=config.media;
const options=media.storage,client=new S3Client({endpoint:options.endpoint,region:options.region,forcePathStyle:options.forcePathStyle,credentials:storageCredentials(options.credentials)});
const org=randomUUID(),source=`media/${org}/${randomUUID()}/document`,target=`media/${org}/${randomUUID()}/document`,bytes=Buffer.from('Synthetic feedback storage verification');
try{
 const upload=await storage.createUploadUrl({storageKey:source,contentType:'text/plain',contentLength:bytes.length,expiresInSeconds:60});
 const put=await fetch(upload.url,{method:'PUT',headers:upload.requiredHeaders,body:bytes});assert.equal(put.status,200);
 await storage.copyPrivateObject(source,target);
 let stream=await storage.getPrivateObject(target);if(media.scannerMode==='EXTERNAL_REQUIRED')stream=scannedMediaStream(stream,media.scannerHost,media.scannerPort);
 const chunks=[];for await(const chunk of stream)chunks.push(chunk);assert.deepEqual(Buffer.concat(chunks),bytes);
 const url=await storage.createAccessUrl({storageKey:target,contentType:'application/octet-stream',downloadName:'verification.txt',expiresInSeconds:60});
 const result=await fetch(url);assert.equal(result.status,200);assert.match(result.headers.get('content-disposition'),/^attachment/);assert.deepEqual(Buffer.from(await result.arrayBuffer()),bytes);
 console.log(JSON.stringify({result:'PASS',privatePutCopyRead:true,downloadDisposition:true,scannerMode:media.scannerMode,realFeedbackRowsCreated:0}));
}finally{
 for(const Key of [source,target])await client.send(new DeleteObjectCommand({Bucket:options.bucket,Key}));
 client.destroy();storage.onModuleDestroy();
}
