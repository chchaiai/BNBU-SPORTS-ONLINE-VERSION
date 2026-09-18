import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import type { MediaStoragePort } from '../../common/object-storage/media-storage.port.js';
import type { MediaEvidence } from '../../generated/prisma/client.js';
import { processedVideoKey } from '../media/application/video-normalizer.js';

const execute = promisify(execFile);
export async function prepareAiMedia(storage: MediaStoragePort, media: readonly MediaEvidence[], signal: AbortSignal): Promise<{ images: Buffer[]; sampledVideo: boolean }> {
  const images: Buffer[] = [];
  let sampledVideo = false;
  for (const item of media) {
    signal.throwIfAborted();
    const normalized = item.mediaType === 'VIDEO' && (item.safeMetadata as Record<string, unknown>)?.normalized === 1;
    const stream = await storage.getPrivateObject(normalized ? processedVideoKey(item.storageKey,item.safeMetadata) : item.storageKey);
    const abort = (): void => { stream.destroy(new Error('AI_MEDIA_TIMEOUT')); };
    signal.addEventListener('abort', abort, { once: true });
    const parts: Buffer[] = []; let size = 0;
    try {
      for await (const part of stream) {
        signal.throwIfAborted();
        const bytes = Buffer.from(part as Uint8Array); size += bytes.length;
        if (size > Number(item.verifiedFileSizeBytes) || size > 200 * 1024 * 1024) throw new Error('AI_MEDIA_INTEGRITY');
        parts.push(bytes);
      }
    } finally { signal.removeEventListener('abort', abort); stream.destroy(); }
    const source = Buffer.concat(parts);
    if (size !== Number(item.verifiedFileSizeBytes) || createHash('sha256').update(source).digest('hex') !== item.verifiedContentSha256) throw new Error('AI_MEDIA_INTEGRITY');
    if (item.mediaType === 'IMAGE') {
      images.push(await sharp(source, { limitInputPixels: 40_000_000 }).timeout({ seconds: 10 }).rotate().resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer());
    } else if (item.mediaType === 'VIDEO') {
      sampledVideo = true;
      const directory = await mkdtemp(join(tmpdir(), 'bnbu-ai-'));
      try {
        const input = join(directory, 'source.mp4');
        await writeFile(input, source);
        await execute('ffmpeg', ['-nostdin','-v','error','-threads','1','-max_alloc','67108864','-protocol_whitelist','file,pipe',
          '-i', input, '-vf', 'fps=1,scale=768:768:force_original_aspect_ratio=decrease', '-frames:v','15','-threads','1',join(directory, 'frame-%02d.jpg')],
          { timeout: 45_000, maxBuffer: 1024 * 1024, windowsHide: true, signal });
        let count = 0;
        for (let index = 1; index <= 15; index++) {
          try { images.push(await readFile(join(directory, `frame-${String(index).padStart(2,'0')}.jpg`))); count++; }
          catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') break; throw error; }
        }
        if (!count) throw new Error('AI_VIDEO_DECODE_FAILED');
      } finally { await rm(directory, { recursive: true, force: true }); }
    } else throw new Error('AI_MEDIA_TYPE_INVALID');
  }
  if (!images.length) throw new Error('AI_MEDIA_MISSING');
  return { images, sampledVideo };
}
