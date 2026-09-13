// Read only: bounded HEAD requests for the exact database-derived manifest.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {storageCredentials} from '/app/dist/common/object-storage/tencent-cvm-role-credential-provider.js';
const require=createRequire('/app/package.json');
const {S3Client,HeadObjectCommand}=require('@aws-sdk/client-s3');
const manifest=JSON.parse(readFileSync('/app/synthetic-cleanup-inventory-v2.json','utf8'));
assert.equal(manifest.check,'SYNTHETIC_CLEANUP_INVENTORY');
assert.equal(manifest.objects.length,45);
assert.equal(new Set(manifest.objects.map(x=>x.storage_key)).size,45);
await loadRuntimeSecrets(process.env);
const config=validateEnvironment(process.env).RUNTIME_CONFIG;
assert.equal(config.appEnvironment,'production');
const c=config.objectStorage;
assert.equal(c.bucket,'bnbu-sports-prod-hk-1443273655');
const client=new S3Client({endpoint:c.endpoint,region:c.region,forcePathStyle:c.forcePathStyle,credentials:storageCredentials(c.credentials),maxAttempts:1});
const results=[];
try {
 for(const object of manifest.objects){
  assert.ok(manifest.organizationIds.includes(object.organization_id));
  assert.ok(typeof object.storage_key==='string' && !object.storage_key.includes('..'));
  try {
   const head=await client.send(new HeadObjectCommand({Bucket:c.bucket,Key:object.storage_key}),{abortSignal:AbortSignal.timeout(10000)});
   results.push({...object,status:'EXISTS',bytes:head.ContentLength,contentType:head.ContentType});
  }catch(error){
   const status=error.$metadata?.httpStatusCode;
   results.push({...object,status:status===404?'ABSENT':'UNVERIFIED',httpStatus:status??null,providerCode:error.name});
   if(status!==404)break;
  }
 }
 console.log(JSON.stringify({check:'SYNTHETIC_COS_HEAD_INVENTORY',observedAt:new Date().toISOString(),expected:45,checked:results.length,results,scope:'Exact database-referenced objects only; HEAD only; no listing, upload, download or deletion'}));
}finally{client.destroy();}
