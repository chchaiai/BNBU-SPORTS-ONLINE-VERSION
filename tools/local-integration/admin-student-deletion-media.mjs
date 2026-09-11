// Local MinIO fault injection only: verify cleanup after a late upload completes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from '../../backend/node_modules/pg/lib/index.js';
import {createRequire} from 'node:module';
const {S3Client,HeadObjectCommand,PutObjectCommand}=createRequire(new URL('../../backend/package.json',import.meta.url))('@aws-sdk/client-s3');
const fixture=JSON.parse(fs.readFileSync('/workspace/.browser-state/student-deletion-student-private.json'));
assert.ok(fixture.studentNumber.startsWith('JOIN'));
const db=new pg.Client({host:'sql-postgres',database:'v81_browser_test',user:process.env.PGUSER,password:process.env.PGPASSWORD});
const storage=new S3Client({endpoint:'http://media-minio:9000',region:'us-east-1',forcePathStyle:true,
  credentials:{accessKeyId:'v81-local-media',secretAccessKey:process.env.PGPASSWORD}});
await db.connect();
try {
 const rows=(await db.query('SELECT id,storage_key FROM v81_student_media_erasure WHERE student_id=$1',[fixture.membership.studentProfile.id])).rows;
 assert.equal(rows.length,2);
 for(const row of rows){
  const input={Bucket:'synthetic-media-private',Key:row.storage_key};
  await assert.rejects(()=>storage.send(new HeadObjectCommand(input)),error=>error.$metadata?.httpStatusCode===404);
  await storage.send(new PutObjectCommand({...input,Body:Buffer.from('synthetic upload finishing after deletion')}));
  await db.query('UPDATE v81_student_media_erasure SET deleted_at=NULL,finalize_after=now(),next_attempt_at=now() WHERE id=$1',[row.id]);
 }
 for(let attempt=0;attempt<30;attempt++){
  const count=Number((await db.query('SELECT count(*) FROM v81_student_media_erasure WHERE student_id=$1 AND deleted_at IS NOT NULL',[fixture.membership.studentProfile.id])).rows[0].count);
  if(count===2)break;await new Promise(resolve=>setTimeout(resolve,1000));
 }
 for(const row of rows)await assert.rejects(()=>storage.send(new HeadObjectCommand({Bucket:'synthetic-media-private',Key:row.storage_key})),error=>error.$metadata?.httpStatusCode===404);
 console.log(JSON.stringify({check:'STUDENT_MEDIA_ERASURE_LATE_UPLOAD',result:'PASS',initialObjectsAbsent:2,lateUploadsErased:2,localMinioOnly:true}));
}finally{await db.end();storage.destroy();}
