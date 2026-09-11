import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { foundationEnvironment } from '../../backend/test/helpers/test-environment.ts';
import { validateEnvironment } from '../../backend/dist/common/config/environment.js';
import { S3MediaStorageAdapter } from '../../backend/dist/common/object-storage/s3-media-storage.adapter.js';

export async function probeMediaSigningOrigin({ databaseUrl, fixture, localStorage }) {
  const raw = { ...foundationEnvironment(databaseUrl,3199), MEDIA_STORAGE_ENDPOINT:localStorage.endpoint,
    MEDIA_STORAGE_PUBLIC_ENDPOINT:'http://127.0.0.1:19000',MEDIA_STORAGE_BUCKET:localStorage.bucket,
    MEDIA_STORAGE_ACCESS_KEY:localStorage.accessKeyId,MEDIA_STORAGE_SECRET_KEY:localStorage.secretAccessKey };
  for(const endpoint of ['file:///etc/passwd','http://user:password@localhost:19000','http://localhost:19000?secret=x'])
    assert.throws(()=>validateEnvironment({...raw,MEDIA_STORAGE_PUBLIC_ENDPOINT:endpoint}));
  const config=validateEnvironment(raw).RUNTIME_CONFIG;
  assert.equal(config.media.storage.endpoint,localStorage.endpoint);
  assert.equal(config.media.publicEndpoint,'http://127.0.0.1:19000');
  const adapter=new S3MediaStorageAdapter(config);
  const privateEndpoint=new URL(localStorage.endpoint),bytes=Buffer.from('Synthetic public signing origin roundtrip');
  const key=`media/${fixture.organizationId}/${randomUUID()}/image`;
  // Connect over the container network while preserving the signed public Host, as a reverse proxy must do.
  const forward=(url,method,body=null,requiredHeaders={},host=new URL(url).host)=>new Promise((resolve,reject)=>{
    const signed=new URL(url),request=http.request({hostname:privateEndpoint.hostname,port:privateEndpoint.port,
      method,path:signed.pathname+signed.search,headers:{...requiredHeaders,host}},response=>{
        const parts=[];response.on('data',part=>parts.push(part));response.on('end',()=>resolve({status:response.statusCode,bytes:Buffer.concat(parts)}));
      });request.on('error',reject);request.end(body);
  });
  try{
    await adapter.checkHealth();
    const upload=await adapter.createUploadUrl({storageKey:key,contentType:'application/octet-stream',contentLength:bytes.length,expiresInSeconds:60});
    assert.equal(new URL(upload.url).origin,'http://127.0.0.1:19000');
    assert.equal((await forward(upload.url,'PUT',bytes,upload.requiredHeaders)).status,200);
    const metadata=await adapter.headPrivateObject(key);assert.equal(metadata.contentLength,bytes.length);
    const read=[];for await(const part of await adapter.getPrivateObject(key))read.push(Buffer.from(part));
    assert.ok(Buffer.concat(read).equals(bytes));
    const access=await adapter.createAccessUrl({storageKey:key,contentType:'application/octet-stream',expiresInSeconds:60});
    assert.equal(new URL(access).origin,'http://127.0.0.1:19000');
    const result=await forward(access,'GET');assert.equal(result.status,200);assert.ok(result.bytes.equals(bytes));
    assert.equal((await forward(access,'GET',null,{},privateEndpoint.host)).status,403);
    const unsigned=new URL(access);unsigned.search='';assert.equal((await forward(unsigned.href,'GET')).status,403);
    const defaultConfig=validateEnvironment({...raw,MEDIA_STORAGE_PUBLIC_ENDPOINT:''}).RUNTIME_CONFIG;
    const defaultAdapter=new S3MediaStorageAdapter(defaultConfig);
    try{assert.equal(new URL(await defaultAdapter.createAccessUrl({storageKey:key,contentType:'application/octet-stream',expiresInSeconds:60})).origin,privateEndpoint.origin);}
    finally{defaultAdapter.onModuleDestroy();}
    console.log(JSON.stringify({check:'MEDIA_PUBLIC_SIGNING_PRIVATE_TRANSPORT_HOST_INTEGRITY',result:'PASS',syntheticObject:true,browserProxyNotStarted:true}));
  }finally{adapter.onModuleDestroy();}
}
