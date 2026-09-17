import {execFile} from 'node:child_process';
import {createReadStream, createWriteStream} from 'node:fs';
import {mkdtemp, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable, Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {promisify} from 'node:util';
import {ApplicationError} from '../../../common/errors/application-error.js';
import type {MediaConfig} from '../../../common/config/environment.js';
import type {MediaStoragePort} from '../../../common/object-storage/media-storage.port.js';
import type {MediaValidator, DeclaredMediaFacts, VerifiedMediaFacts} from './media-validator.js';

const execute = promisify(execFile);
export const processedVideoKey = (key: string): string => `${key}/normalized.mp4`;
export class VideoNormalizationError extends Error {
  constructor(readonly stage: string, readonly terminal: boolean) {
    super(`VIDEO_${stage}_FAILED`);
  }
}

export async function normalizeServerVideo(storage: MediaStoragePort, storageKey: string,
  declared: DeclaredMediaFacts, config: MediaConfig, validator: MediaValidator): Promise<VerifiedMediaFacts> {
  const directory = await mkdtemp(join(tmpdir(), 'bnbu-video-'));
  const source = join(directory, 'source');
  const output = join(directory, 'normalized.mp4');
  let stage = 'DOWNLOAD';
  try {
    let received = 0;
    await pipeline(await storage.getPrivateObject(storageKey), new Transform({
      transform(chunk: Buffer, _encoding, callback): void {
        received += chunk.length;
        callback(received > Math.min(config.maxVideoTransportBytes, 200 * 1024 * 1024)
          ? new ApplicationError('MEDIA_SIZE_EXCEEDED', 413) : null, chunk);
      },
    }), createWriteStream(source), {signal: AbortSignal.timeout(120_000)});
    if (received !== declared.fileSizeBytes) throw new ApplicationError('MEDIA_INTEGRITY_MISMATCH', 422);
    // Verify the immutable raw bytes again before decoding.
    await validator.readRawVideo(createReadStream(source), declared, config);
    stage = 'PROBE';
    const probe = await execute('ffprobe', ['-v','error','-max_alloc','67108864','-protocol_whitelist','file,pipe','-show_streams','-show_format','-of','json',source],
      {timeout:30_000, maxBuffer:1024*1024, windowsHide:true});
    const facts = JSON.parse(probe.stdout) as {streams: Record<string, unknown>[]; format: {duration?: string}};
    const video = facts.streams.find(stream => stream.codec_type === 'video');
    const audio = facts.streams.find(stream => stream.codec_type === 'audio');
    if (!video) throw new ApplicationError('MEDIA_INTEGRITY_MISMATCH',422);
    if (!audio) throw new ApplicationError('MEDIA_AUDIO_TRACK_REQUIRED',422);
    const duration = Number(facts.format.duration ?? video.duration);
    // Missing WebM duration is checked against decoded output below. Decode at
    // most eleven seconds so malformed or unbounded inputs cannot occupy a worker.
    if (Number.isFinite(duration) && (duration < 1 || duration > 10.1)) throw new ApplicationError('MEDIA_VIDEO_DURATION_EXCEEDED',422);
    if (!Number.isFinite(duration)) {
      const decoded = await execute('ffmpeg', ['-nostdin','-v','error','-xerror','-threads','1','-protocol_whitelist','file,pipe',
        '-i',source,'-t','11','-map','0:v:0','-map','0:a:0','-progress','pipe:1','-nostats','-f','null','-'],
        {timeout:120_000,maxBuffer:1024*1024,windowsHide:true});
      const times = [...decoded.stdout.matchAll(/^out_time_us=(\d+)$/gm)].map(match=>Number(match[1])/1_000_000);
      const decodedDuration = Math.max(0,...times);
      if (decodedDuration < 1 || decodedDuration > 10.1) throw new ApplicationError('MEDIA_VIDEO_DURATION_EXCEEDED',422);
    }
    const hdr = ['smpte2084','arib-std-b67'].includes(String(video.color_transfer));
    const scale = "scale='if(gte(iw,ih),min(iw,1920),min(iw,1080))':'if(gte(iw,ih),min(ih,1080),min(ih,1920))':force_original_aspect_ratio=decrease:force_divisible_by=2";
    const filters = [scale, ...(hdr ? ['zscale=t=linear:npl=100','format=gbrpf32le','zscale=p=bt709','tonemap=hable','zscale=t=bt709:m=bt709:r=tv'] : []), 'fps=30','setsar=1','format=yuv420p'];
    stage = 'ENCODE';
    await execute('ffmpeg', ['-nostdin','-v','error','-max_alloc','67108864','-xerror','-threads','1','-protocol_whitelist','file,pipe','-i',source,
      '-t','10','-map','0:v:0','-map','0:a:0','-vf',filters.join(','),'-filter_threads','1',
      '-c:v','libx264','-threads','1','-preset','veryfast','-crf','24','-pix_fmt','yuv420p',
      '-c:a','aac','-ac','2','-ar','48000','-map_metadata','-1','-map_metadata:s','-1','-map_chapters','-1',
      '-movflags','+faststart',output], {timeout:180_000, maxBuffer:1024*1024, windowsHide:true});
    const outputSize = (await stat(output)).size;
    stage = 'VERIFY';
    const verified = await validator.readAndVerify(createReadStream(output), {...declared, mimeType:'video/mp4', fileSizeBytes:outputSize, contentSha256:null, durationSeconds:null}, config);
    if (verified.durationSeconds === null || verified.durationSeconds > 10) throw new ApplicationError('MEDIA_VIDEO_DURATION_EXCEEDED',422);
    stage = 'STORE';
    const transport = await storage.createUploadUrl({storageKey:processedVideoKey(storageKey), contentType:'video/mp4', contentLength:outputSize, expiresInSeconds:300});
    const response = await fetch(transport.url, {method:'PUT', headers:transport.requiredHeaders,
      body:Readable.toWeb(createReadStream(output)), duplex:'half', signal:AbortSignal.timeout(120_000)});
    if (!response.ok) throw new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE',503,{dependency:'MEDIA_STORAGE'});
    return {...verified, safeMetadata:{...verified.safeMetadata, videoPipeline:1, normalized:1, sourceCodec:String(video.codec_name), sourceFps:String(video.avg_frame_rate), sourceHdr:hdr ? 1 : 0, sourceWidth:Number(video.width), sourceHeight:Number(video.height)}};
  } catch (error) {
    if (error instanceof ApplicationError) throw error;
    const code = (error as {code?:unknown})?.code;
    throw new VideoNormalizationError(stage, typeof code === 'number' && code > 0);
  } finally {
    await rm(directory, {recursive:true, force:true});
  }
}
