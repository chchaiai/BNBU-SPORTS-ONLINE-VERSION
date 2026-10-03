// A container name does not guarantee a playable recording. Normalize recorder
// output (including fragmented MP4) to a finalized H.264/AAC MP4 in a worker.
import {PROOF_VIDEO_MAX_BYTES, mimeEssence} from './proofs.js';

export class VideoProcessingError extends Error {
 constructor(stage, timedOut = false) {
  super(`Video processing failed: ${stage}`);
  this.name = 'VideoProcessingError'; this.stage = stage; this.timedOut = timedOut;
 }
}

export function canRemuxRecording(streams) {
 const video = streams.find(stream => stream.codec_type === 'video');
 const audio = streams.find(stream => stream.codec_type === 'audio');
 return video?.codec_name === 'h264' && video.pix_fmt === 'yuv420p' &&
  Math.max(video.width, video.height) <= 1920 && audio?.codec_name === 'aac';
}

export async function normalizeRecordedVideo(file, {createWorker} = {}) {
 let type=mimeEssence(file.type);
 if(!['video/mp4','video/webm','video/quicktime'].includes(type)) {
  const header=new Uint8Array(await file.slice(0,16).arrayBuffer());
  if(String.fromCharCode(...header.slice(4,8))==='ftyp')type='video/mp4';
  else if(header[0]===0x1a&&header[1]===0x45&&header[2]===0xdf&&header[3]===0xa3)type='video/webm';
 }
 if(!['video/mp4','video/webm','video/quicktime'].includes(type)||file.size<1||file.size>PROOF_VIDEO_MAX_BYTES)throw new Error('Unsupported recording source');
 const worker = createWorker ? await createWorker() : new (await import('../vendor/ffmpeg/api/classes.js?v=iphone-20260915')).FFmpeg();
 const step = async (stage, work, milliseconds = 30000) => {
  let timeout;
  try {
   return await Promise.race([Promise.resolve().then(work), new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new VideoProcessingError(stage, true)), milliseconds);
   })]);
  } catch (error) { throw error instanceof VideoProcessingError ? error : new VideoProcessingError(stage); }
  finally { clearTimeout(timeout); }
 };
 try{
   await step('load', () => worker.load({coreURL:new URL('../vendor/ffmpeg/core/ffmpeg-core.js?v=67a48f11645f',import.meta.url).href,wasmURL:new URL('../vendor/ffmpeg/core/ffmpeg-core.wasm?v=9f57947a5bd5-iphone-20260915',import.meta.url).href}), 90000);
   await step('read', async () => worker.writeFile('source',new Uint8Array(await file.arrayBuffer())));
   const streams = await step('probe', async () => {
    const result = await worker.ffprobe(['-v','error','-show_streams','-of','json','source','-o','streams.json'], 30000);
    // This shipped core leaves ret=-1 after a successful ffprobe. Require
    // parseable stream output as well; positive exit codes are failures.
    if (result !== 0 && result !== -1) throw new Error('Recording probe failed');
    const streams = JSON.parse(await worker.readFile('streams.json','utf8')).streams;
    if (!Array.isArray(streams) || !streams.some(stream => stream.codec_type === 'video')) throw new Error('No video stream');
    return streams;
   });
   if (!streams.some(stream => stream.codec_type === 'audio')) throw new VideoProcessingError('audio');
   let remuxed = false;
   if (canRemuxRecording(streams)) {
    remuxed = await step('remux', async () => (await worker.exec(['-i','source','-map','0:v:0','-map','0:a:0','-c','copy','-map_metadata','-1','-map_metadata:s','-1','-map_chapters','-1','-movflags','+faststart','output.mp4'],30000)) === 0);
   }
   if (!remuxed) await step('encode', async () => {
    const result=await worker.exec(['-threads','1','-i','source','-map','0:v:0','-map','0:a:0','-vf',"scale='if(gte(iw,ih),min(iw,1280),min(iw,720))':'if(gte(iw,ih),min(ih,720),min(ih,1280))':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30,setsar=1",'-c:v','libx264','-profile:v','baseline','-level:v','3.1','-preset','ultrafast','-crf','24','-pix_fmt','yuv420p','-c:a','aac','-profile:a','aac_low','-ar','44100','-ac','2','-map_metadata','-1','-map_metadata:s','-1','-map_chapters','-1','-movflags','+faststart','-threads','1','output.mp4'],120000);
    if(result!==0)throw new Error('Recording conversion failed');
   }, 125000);
   return await step('preview', async () => {
   const bytes=await worker.readFile('output.mp4');
   if(!bytes.length||bytes.length>PROOF_VIDEO_MAX_BYTES)throw new Error('Converted recording size invalid');
   const durationSeconds = finalizedMp4Duration(bytes);
   if (!durationSeconds) throw new Error('Converted recording duration invalid');
   // Decode the finalized output in the worker. A hidden HTML video is subject
   // to mobile autoplay/preload policy and cannot serve as a codec verdict.
   await worker.deleteFile('source');
   const posterResult = await worker.exec(['-threads','1','-i','output.mp4','-frames:v','1','-vf','scale=640:640:force_original_aspect_ratio=decrease','-q:v','3','-threads','1','poster.jpg'],30000);
   if (posterResult !== 0) throw new Error('Converted recording frame decode failed');
   const poster = await worker.readFile('poster.jpg');
   if (!poster.length) throw new Error('Converted recording frame missing');
   let binary='';for(const byte of poster)binary+=String.fromCharCode(byte);
   return {file:new File([bytes],'recording.mp4',{type:'video/mp4'}),
     preview:{durationSeconds,thumbnailUrl:'data:image/jpeg;base64,'+btoa(binary)}};
   });
 }finally{worker.terminate();}
}

// Read mvhd from a finalized MP4, including extended atom sizes and version 1.
export function finalizedMp4Duration(bytes) {
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const scan=(start,end)=>{
  for(let offset=start;offset+8<=end;) {
   let size=view.getUint32(offset),header=8;
   const type=String.fromCharCode(...bytes.subarray(offset+4,offset+8));
   if(size===1){if(offset+16>end)return null;size=Number(view.getBigUint64(offset+8));header=16;}
   if(size===0)size=end-offset;
   if(!Number.isSafeInteger(size)||size<header||offset+size>end)return null;
   const data=offset+header;
   if(type==='moov') {const found=scan(data,offset+size);if(found)return found;}
   if(type==='mvhd') {
    if(data+4>offset+size)return null;
    const version=bytes[data],base=data+(version===1?20:12);
    if(version>1||base+(version===1?12:8)>offset+size)return null;
    const scale=view.getUint32(base),duration=version===1?Number(view.getBigUint64(base+4)):view.getUint32(base+4);
    return scale>0&&duration>0&&Number.isFinite(duration)?duration/scale:null;
   }
   offset+=size;
  }
  return null;
 };
 return scan(0,bytes.length);
}
