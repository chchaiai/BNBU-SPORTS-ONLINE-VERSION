// One tiny task-owned object; reports provider status without credentials.
import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {createRequire} from 'node:module';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';import {validateEnvironment} from '/app/dist/common/config/environment.js';import {storageCredentials} from '/app/dist/common/object-storage/tencent-cvm-role-credential-provider.js';
const require=createRequire('/app/package.json'),{S3Client,PutObjectCommand,DeleteObjectCommand,HeadObjectCommand,GetObjectCommand,CreateMultipartUploadCommand,UploadPartCommand,CompleteMultipartUploadCommand,AbortMultipartUploadCommand}=require('@aws-sdk/client-s3');await loadRuntimeSecrets(process.env);const c=validateEnvironment(process.env).RUNTIME_CONFIG.objectStorage;assert.equal(c.bucket,'bnbu-sports-prod-hk-1443273655');
const client=new S3Client({endpoint:c.endpoint,region:c.region,forcePathStyle:c.forcePathStyle,credentials:storageCredentials(c.credentials),maxAttempts:1});const Key=`v81/physical-imports/01a096c2-20a2-706b-8c69-802f67dee12c/probe-${randomUUID()}.txt`;let created=false;const result={check:'CVM_ROLE_PHYSICAL_IMPORT_COS',observedAt:new Date().toISOString(),key:Key};
let uploadId;
try{
 const base={Bucket:c.bucket,Key};
 await client.send(new PutObjectCommand({...base,Body:'synthetic permission probe',ContentType:'text/plain'}));created=true;result.put='PASS';
 const head=await client.send(new HeadObjectCommand(base));assert.equal(head.ContentLength,26);result.head='PASS';
 const got=await client.send(new GetObjectCommand(base));assert.equal(await got.Body.transformToString(),'synthetic permission probe');result.get='PASS';
 uploadId=(await client.send(new CreateMultipartUploadCommand(base))).UploadId;result.initiate='PASS';
 const part=await client.send(new UploadPartCommand({...base,UploadId:uploadId,PartNumber:1,Body:'synthetic multipart probe'}));result.uploadPart='PASS';
 await client.send(new CompleteMultipartUploadCommand({...base,UploadId:uploadId,MultipartUpload:{Parts:[{ETag:part.ETag,PartNumber:1}]}}));uploadId=null;result.complete='PASS';
 uploadId=(await client.send(new CreateMultipartUploadCommand(base))).UploadId;
 await client.send(new AbortMultipartUploadCommand({...base,UploadId:uploadId}));uploadId=null;result.abort='PASS';
}catch(e){result.failure={providerCode:e.name,httpStatus:e.$metadata?.httpStatusCode,message:e.name==='AssertionError'?e.message:undefined};}

finally{if(uploadId)await client.send(new AbortMultipartUploadCommand({Bucket:c.bucket,Key,UploadId:uploadId}));if(created){await client.send(new DeleteObjectCommand({Bucket:c.bucket,Key}));result.cleanup='PASS';}client.destroy();console.log(JSON.stringify(result));}
