// Read-only verification of the reported media against the candidate/live validator.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
import {S3MediaStorageAdapter} from '/app/dist/common/object-storage/s3-media-storage.adapter.js';
import {MediaValidator} from '/app/dist/modules/media/application/media-validator.js';
await loadRuntimeSecrets(process.env);
const cfg=validateEnvironment(process.env).RUNTIME_CONFIG;
assert.equal(cfg.appEnvironment,'production');assert.equal(cfg.media.maxImagePixels,0);
const db=new PrismaService(cfg),storage=new S3MediaStorageAdapter(cfg),validator=new MediaValidator();
try{
 const media=await db.mediaEvidence.findUniqueOrThrow({where:{id:'01a0be4f-db96-770c-9afe-fa65eb859bd0'}});
 assert.equal(media.mediaType,'IMAGE');assert.equal(media.declaredMimeType,'image/jpeg');
 const parts=[];for await(const chunk of await storage.getPrivateObject(media.storageKey))parts.push(chunk);
 const body=Buffer.concat(parts),digest=createHash('sha256').update(body).digest('hex');
 assert.equal(digest,media.declaredContentSha256);assert.equal(body.length,Number(media.declaredFileSizeBytes));
 const facts={businessPurpose:media.businessPurpose,mediaType:media.mediaType,mimeType:media.declaredMimeType,
  fileSizeBytes:body.length,contentSha256:digest,durationSeconds:null};
 const verified=await validator.readAndVerify(Readable.from([body]),facts,cfg.media);
 assert.equal(verified.safeMetadata.width,6144);assert.equal(verified.safeMetadata.height,8192);
 await assert.rejects(validator.readAndVerify(Readable.from([body]),{...facts,contentSha256:'0'.repeat(64)},cfg.media));
 const after=await db.mediaEvidence.findUniqueOrThrow({where:{id:media.id}});assert.equal(after.version,media.version);assert.equal(after.uploadStatus,media.uploadStatus);
 const video=await db.mediaEvidence.findUniqueOrThrow({where:{id:'01a0bf31-e62c-70df-b5d8-fb6f184c5794'}});
 assert.equal(video.uploadStatus,'AVAILABLE');
 console.log(JSON.stringify({result:'PASS',pixelCap:0,width:6144,height:8192,bytes:body.length,originalHashUnchanged:true,
  scannerMode:cfg.media.scannerMode,integrityRejection:'PASS',reportedVideoAvailable:true,businessWrites:0}));
}finally{await db.$disconnect();}
