// Native MP4 passes through. Other in-app formats are converted locally in a worker.
import {PROOF_VIDEO_MAX_BYTES, mimeEssence} from './proofs.js';
export async function normalizeRecordedVideo(file) {
 const type=mimeEssence(file.type);
 if(type==='video/mp4')return file;
 if(!['video/webm','video/quicktime'].includes(type)||file.size<1||file.size>PROOF_VIDEO_MAX_BYTES)throw new Error('Unsupported recording source');
 const {FFmpeg}=await import('../vendor/ffmpeg/api/index.js');const worker=new FFmpeg();let timeout;
 try{
  const task=(async()=>{
   await worker.load({coreURL:new URL('../vendor/ffmpeg/core/ffmpeg-core.js',import.meta.url).href,wasmURL:new URL('../vendor/ffmpeg/core/ffmpeg-core.wasm',import.meta.url).href});
   await worker.writeFile('source',new Uint8Array(await file.arrayBuffer()));
   const result=await worker.exec(['-i','source','-map','0:v:0','-map','0:a:0','-c:v','libx264','-preset','ultrafast','-crf','24','-pix_fmt','yuv420p','-c:a','aac','-map_metadata','-1','-movflags','+faststart','-threads','1','output.mp4']);
   if(result!==0)throw new Error('Recording conversion failed');const bytes=await worker.readFile('output.mp4');
   if(!bytes.length||bytes.length>PROOF_VIDEO_MAX_BYTES)throw new Error('Converted recording size invalid');return new File([bytes],'recording.mp4',{type:'video/mp4'});
  })();
  return await Promise.race([task,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Recording conversion timed out')),90000);})]);
 }finally{clearTimeout(timeout);worker.terminate();}
}
