// Read-only database checks and synthetic private COS objects; no school rows are changed.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import sharp from 'sharp';
import {loadRuntimeSecrets} from '/app/dist/common/config/file-json-secret-loader.js';
import {validateEnvironment} from '/app/dist/common/config/environment.js';
import {PrismaService} from '/app/dist/common/database/prisma.service.js';
import {S3MediaStorageAdapter} from '/app/dist/common/object-storage/s3-media-storage.adapter.js';
import {MediaValidator} from '/app/dist/modules/media/application/media-validator.js';

assert.equal(process.env.BNBU_DEMAND_PROVIDER_SMOKE,'1');
await loadRuntimeSecrets(process.env);
const config=validateEnvironment(process.env).RUNTIME_CONFIG;
assert.equal(new URL(config.databaseUrl).hostname,'172.19.0.16');
assert.equal(config.media.scannerMode,'EXTERNAL_REQUIRED');
const db=new PrismaService(config),storage=new S3MediaStorageAdapter(config),validator=new MediaValidator();
const results=[];
try{
  const columns=await db.$queryRaw`SELECT table_name,column_name FROM information_schema.columns
    WHERE table_schema='public' AND (table_name='student_profiles' AND column_name IN ('date_of_birth','region_code')
      OR table_name='v81_course_rules' AND column_name='daily_limit'
      OR table_name='media_evidence' AND column_name='safe_metadata'
      OR table_name='class_sections' AND column_name='retired_at')`;
  assert.equal(columns.length,5);
  const tables=await db.$queryRaw`SELECT to_regclass('public.v81_history_settings')::text AS settings,
    to_regclass('public.v81_history_session_sources')::text AS sources`;
  assert.ok(tables[0].settings&&tables[0].sources);
  results.push({check:'CLOUD_DEMAND_DATABASE_SCHEMA',result:'PASS'});
  const pdf=await PDFDocument.create();pdf.addPage([100,100]);
  const sources=[{type:'DOCUMENT',mime:'application/pdf',bytes:Buffer.from(await pdf.save())},
    {type:'IMAGE',mime:'image/jpeg',bytes:await sharp({create:{width:8,height:8,channels:3,background:'#265088'}})
      .withExif({IFD0:{Make:'Synthetic Camera',Model:'Cloud Smoke'},IFD2:{DateTimeOriginal:'2026:09:11 12:00:00'}}).jpeg().toBuffer()}];
  for(const source of sources){
    const key=`media/${randomUUID()}/${randomUUID()}/${source.type.toLowerCase()}`;
    const upload=await storage.createUploadUrl({storageKey:key,contentType:source.mime,contentLength:source.bytes.length,expiresInSeconds:120});
    assert.equal((await fetch(upload.url,{method:upload.method,headers:upload.requiredHeaders,body:source.bytes})).status,200);
    const verified=await validator.readAndVerify(await storage.getPrivateObject(key),{
      businessPurpose:'EXEMPTION_APPLICATION',mediaType:source.type,mimeType:source.mime,fileSizeBytes:source.bytes.length,
      contentSha256:createHash('sha256').update(source.bytes).digest('hex'),durationSeconds:null,
    },config.media);
    assert.equal(verified.mimeType,source.mime);
    if(source.type==='DOCUMENT')assert.equal(verified.safeMetadata.pageCount,1);
    else assert.equal(verified.safeMetadata.Model,'Cloud Smoke');
    const access=await storage.createAccessUrl({storageKey:key,contentType:source.mime,expiresInSeconds:120});
    const downloaded=await fetch(access);assert.equal(downloaded.status,200);
    assert.ok(Buffer.from(await downloaded.arrayBuffer()).equals(source.bytes));
    assert.equal((await fetch(access.split('?')[0])).status,403);
    results.push({check:'CLOUD_COS_CLAMAV_PRIVATE_ORIGINAL',result:'PASS',mediaType:source.type,bytes:source.bytes.length,syntheticObjectKey:key});
  }
  console.log(JSON.stringify({check:'DEMAND_CLOUD_PROVIDER',result:'PASS',checks:results}));
}finally{await db.$disconnect();storage.onModuleDestroy();}
