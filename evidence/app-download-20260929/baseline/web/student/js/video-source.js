import {PROOF_VIDEO_MAX_BYTES} from './proofs.js';

export const VIDEO_CAPTURE_SECONDS = 10;
export function recordingLimit(elapsedMs, bytes) {
  if (bytes >= PROOF_VIDEO_MAX_BYTES) return 'size';
  if (elapsedMs >= VIDEO_CAPTURE_SECONDS * 1000) return 'duration';
  return null;
}

// Inspect container signatures without decoding frames or loading a codec.
export async function prepareVideoSource(file) {
  if (!file.size || file.size > PROOF_VIDEO_MAX_BYTES) throw new Error('size');
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  let type;
  if (String.fromCharCode(...header.slice(4, 8)) === 'ftyp') {
    const brand = String.fromCharCode(...header.slice(8, 12));
    type = brand === 'qt  ' ? 'video/quicktime' : brand.startsWith('3g') ? 'video/3gpp' : 'video/mp4';
  } else if ([0x1a,0x45,0xdf,0xa3].every((byte,index) => header[index] === byte)) type = 'video/webm';
  else throw new Error('format');
  return new File([file], file.name || 'recording', {type, lastModified:file.lastModified});
}
