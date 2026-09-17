import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {test} from 'node:test';
import type {MediaConfig} from '../../src/common/config/environment.js';
import {MediaValidator} from '../../src/modules/media/application/media-validator.js';
import {normalizeServerVideo} from '../../src/modules/media/application/video-normalizer.js';
import type {MediaStoragePort} from '../../src/common/object-storage/media-storage.port.js';

test('real FFmpeg normalizes H264, HEVC HDR and WebM; rejects missing audio and excessive duration',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'video-test-'));
  const config={scannerMode:'TEST_SIGNATURE',maxVideoTransportBytes:200*1024*1024} as MediaConfig;
  const validator=new MediaValidator();
  let uploaded:Buffer=Buffer.alloc(0);
  const server=createServer(async(request,response)=>{
    const chunks:Buffer[]=[];for await(const chunk of request)chunks.push(Buffer.from(chunk as Uint8Array));
    uploaded=Buffer.concat(chunks);response.writeHead(200,{ETag:'synthetic'});response.end();
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address() as {port:number};
  try {
    for(const kind of ['mp4','hdr',...(process.env.VIDEO_4K_FIXTURE?['hdr4k']:[]),'webm','boundary','silent','long']) {
      const path=kind==='hdr4k'?process.env.VIDEO_4K_FIXTURE!:join(folder,kind==='webm'?'source.webm':`${kind}.mp4`);
      const args=['-v','error','-filter_threads','1','-f','lavfi','-i',kind==='hdr4k'?'color=size=3840x2160:rate=60':'testsrc2=size=320x180:rate=30'];
      if(kind!=='silent')args.push('-f','lavfi','-i','sine=frequency=440:sample_rate=48000');
      args.push('-t',kind==='long'?'11':(kind==='boundary'||kind==='hdr4k')?'10':'2','-c:v',kind.startsWith('hdr')?'libx265':kind==='webm'?'libvpx':'libx264','-threads','1');
      if(kind.startsWith('hdr'))args.push('-preset','ultrafast','-pix_fmt','yuv420p10le','-color_primaries','bt2020','-color_trc','smpte2084','-colorspace','bt2020nc','-x265-params','pools=none:frame-threads=1:log-level=error');
      if(kind!=='silent')args.push('-c:a',kind==='webm'?'libopus':'aac');
      args.push(path);if(kind!=='hdr4k')execFileSync('ffmpeg',args,{stdio:'pipe',timeout:180000});
      const source=await readFile(path);uploaded=Buffer.alloc(0);
      const declared={businessPurpose:'EXERCISE_RECORD',mediaType:'VIDEO',mimeType:kind==='webm'?'video/webm':'video/mp4',fileSizeBytes:source.length,contentSha256:createHash('sha256').update(source).digest('hex'),durationSeconds:null};
      const storage={getPrivateObject:()=>Promise.resolve(Readable.from(source)),createUploadUrl:()=>Promise.resolve({url:`http://127.0.0.1:${address.port}/processed`,method:'PUT',requiredHeaders:{'content-type':'video/mp4'}})} as unknown as MediaStoragePort;
      const operation=normalizeServerVideo(storage,'media/synthetic/video',declared,config,validator);
      if(kind==='silent'||kind==='long') {
        await assert.rejects(operation,(error:unknown)=>(error as {code:string}).code===(kind==='silent'?'MEDIA_AUDIO_TRACK_REQUIRED':'MEDIA_VIDEO_DURATION_EXCEEDED'));
        assert.equal(uploaded.length,0);
      } else {
        const result=await operation;assert.equal(result.mimeType,'video/mp4');assert.equal(result.safeMetadata.normalized,1);assert.ok(uploaded.length>0);assert.ok(result.durationSeconds!<=10);
        assert.equal(result.contentSha256,createHash('sha256').update(uploaded).digest('hex'));
      }
    }
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(folder,{recursive:true,force:true});}
});
