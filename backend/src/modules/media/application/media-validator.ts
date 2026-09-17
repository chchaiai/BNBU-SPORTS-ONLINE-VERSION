import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';

import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { createRequire } from 'node:module';
const exifr = createRequire(import.meta.url)('exifr') as { parse: (input: Buffer, options: Record<string, unknown>) => Promise<Record<string, unknown> | undefined> };

import type { MediaConfig } from '../../../common/config/environment.js';
import { ApplicationError } from '../../../common/errors/application-error.js';
import { scannedMediaStream } from './clamav-stream.js';

export interface DeclaredMediaFacts {
  businessPurpose: string;
  mediaType: string;
  mimeType: string;
  fileSizeBytes: number;
  contentSha256: string | null;
  durationSeconds: number | null;
}

export interface VerifiedMediaFacts {
  mimeType: string;
  fileSizeBytes: number;
  contentSha256: string;
  durationSeconds: number | null;
  safeMetadata: Record<string, number | string>;
}

const IMAGE_MIME = new Set(['image/jpeg', 'image/png']);
const VIDEO_MIME = new Set(['video/mp4', 'video/quicktime', 'video/3gpp', 'video/webm']);
const EICAR = Buffer.from('EICAR-STANDARD-ANTIVIRUS-TEST-FILE', 'ascii');
const MAX_VIDEO_METADATA_BYTES = 8 * 1024 * 1024;
const WEBM_SIGNATURE = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
const JPEG_START_OF_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb,
]);
const LOCATION_METADATA_TERMS = ['gpslatitude', 'gpslongitude', 'exif:gps', 'location'];

export const MAX_EXERCISE_VIDEO_DURATION_SECONDS = 15;
const MAX_NON_EXERCISE_VIDEO_DURATION_SECONDS = 300;

@Injectable()
export class MediaValidator {
  validateDeclaration(facts: DeclaredMediaFacts, config: MediaConfig): void {
    const mimeType = facts.mimeType.toLowerCase();
    if (
      (facts.mediaType === 'IMAGE' &&
        !IMAGE_MIME.has(mimeType) &&
        !(facts.businessPurpose === 'EXEMPTION_APPLICATION' && mimeType === 'image/webp')) ||
      (facts.mediaType === 'VIDEO' && !VIDEO_MIME.has(mimeType)) ||
      (facts.mediaType === 'DOCUMENT' && (facts.businessPurpose !== 'EXEMPTION_APPLICATION' || mimeType !== 'application/pdf')) ||
      !['IMAGE', 'VIDEO', 'DOCUMENT'].includes(facts.mediaType)
    ) {
      throw new ApplicationError('MEDIA_TYPE_NOT_ALLOWED', 415);
    }
    if (!Number.isSafeInteger(facts.fileSizeBytes) || facts.fileSizeBytes < 1) {
      throw new ApplicationError('VALIDATION_FAILED', 422);
    }
    if (facts.mediaType !== 'VIDEO' && facts.fileSizeBytes > config.maxImageBytes) {
      throw new ApplicationError('MEDIA_SIZE_EXCEEDED', 413);
    }
    if (facts.mediaType === 'VIDEO' && facts.fileSizeBytes > Math.min(config.maxVideoTransportBytes, 200 * 1024 * 1024)) {
      throw new ApplicationError('MEDIA_SIZE_EXCEEDED', 413);
    }
    if (facts.mediaType !== 'VIDEO' && facts.durationSeconds !== null) {
      throw new ApplicationError('VALIDATION_FAILED', 422);
    }
    if (facts.mediaType === 'VIDEO') {
      if (facts.durationSeconds !== null && facts.durationSeconds < 1) {
        throw new ApplicationError('VALIDATION_FAILED', 422);
      }
      if (facts.durationSeconds !== null) {
        if (facts.businessPurpose === 'EXERCISE_RECORD' && facts.durationSeconds > 10) throw new ApplicationError('MEDIA_VIDEO_DURATION_EXCEEDED', 422);
        this.enforceVideoDuration(facts.businessPurpose, facts.durationSeconds, 1);
      }
    }
  }

  async readRawVideo(stream: Readable, declared: DeclaredMediaFacts, config: MediaConfig): Promise<VerifiedMediaFacts> {
    if (config.scannerMode === 'EXTERNAL_REQUIRED') stream = scannedMediaStream(stream, config.scannerHost, config.scannerPort);
    const hash = createHash('sha256');
    let size = 0;
    let prefix = Buffer.alloc(0);
    let tail = Buffer.alloc(0);
    for await (const chunk of stream) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      size += bytes.length;
      if (size > Math.min(config.maxVideoTransportBytes, 200 * 1024 * 1024)) throw new ApplicationError('MEDIA_SIZE_EXCEEDED',413);
      if (prefix.length < 16) prefix = Buffer.concat([prefix, bytes.subarray(0,16-prefix.length)]);
      const scan = Buffer.concat([tail,bytes]);
      if (scan.includes(EICAR)) this.integrityFailure();
      tail = Buffer.from(scan.subarray(Math.max(0,scan.length-64)));
      hash.update(bytes);
    }
    const digest = hash.digest('hex');
    if (size !== declared.fileSizeBytes || (declared.contentSha256 !== null && digest !== declared.contentSha256)) this.integrityFailure();
    const isWebm = prefix.subarray(0,4).equals(WEBM_SIGNATURE);
    if (!isWebm && prefix.subarray(4,8).toString('ascii') !== 'ftyp') this.integrityFailure();
    const mimeType = isWebm ? 'video/webm' : this.isoBaseMediaMimeType(prefix.subarray(8,12).toString('ascii'));
    if (mimeType !== declared.mimeType) this.integrityFailure();
    return {mimeType,fileSizeBytes:size,contentSha256:digest,durationSeconds:null,safeMetadata:{videoPipeline:1}};
  }

  async readAndVerify(
    stream: Readable,
    declared: DeclaredMediaFacts,
    config: MediaConfig,
  ): Promise<VerifiedMediaFacts> {
    if (config.scannerMode === 'EXTERNAL_REQUIRED') {
      stream = scannedMediaStream(stream, config.scannerHost, config.scannerPort);
    }
    if (declared.mediaType === 'VIDEO') {
      return this.readAndVerifyVideo(stream, declared, config);
    }
    const maximum = config.maxImageBytes;
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      length += buffer.length;
      if (length > maximum) throw new ApplicationError('MEDIA_SIZE_EXCEEDED', 413);
      chunks.push(buffer);
    }
    const body = Buffer.concat(chunks, length);
    if (length !== declared.fileSizeBytes) this.integrityFailure();
    const digest = createHash('sha256').update(body).digest('hex');
    if (declared.contentSha256 !== null && declared.contentSha256 !== digest) {
      this.integrityFailure();
    }
    if (body.includes(EICAR)) this.integrityFailure();

    if (declared.mediaType === 'DOCUMENT') {
      if (declared.businessPurpose !== 'EXEMPTION_APPLICATION' || declared.mimeType !== 'application/pdf' ||
        !body.subarray(0, 5).equals(Buffer.from('%PDF-'))) this.integrityFailure();
      try {
        const document = await PDFDocument.load(body, { throwOnInvalidObject: true, updateMetadata: false });
        const pageCount = document.getPageCount();
        if (pageCount < 1) this.integrityFailure();
        return { mimeType: 'application/pdf', fileSizeBytes: length, contentSha256: digest,
          durationSeconds: null, safeMetadata: { pageCount } };
      } catch { this.integrityFailure(); }
    }

    const parsed = this.parseImage(body, config.maxImagePixels);
    if (parsed.mimeType !== declared.mimeType.toLowerCase()) this.integrityFailure();
    // Force pixel decoding: metadata alone can accept a valid header with corrupt image data.
    try {
      const decoder = sharp(body, {
        failOn: 'warning',
        limitInputPixels: config.maxImagePixels,
        pages: -1,
      });
      const metadata = await decoder.metadata();
      const height = metadata.pageHeight ?? metadata.height;
      if (metadata.width !== parsed.safeMetadata.width || height !== parsed.safeMetadata.height) {
        this.integrityFailure();
      }
      await decoder.stats();
    } catch {
      this.integrityFailure();
    }
    return {
      mimeType: parsed.mimeType,
      fileSizeBytes: length,
      contentSha256: digest,
      durationSeconds: parsed.durationSeconds,
      safeMetadata: { ...parsed.safeMetadata, ...await this.photoMetadata(body) },
    };
  }

  private async photoMetadata(body: Buffer): Promise<Record<string, string | number>> {
    // Only camera facts are published. Location, owner names and serial numbers are excluded.
    const tags = ['DateTimeOriginal', 'Make', 'Model', 'FocalLength', 'FNumber', 'ISO', 'ExposureTime', 'Orientation'];
    try {
      const data = await exifr.parse(body, { pick: tags, gps: false, xmp: false, iptc: false,
        reviveValues: false, translateValues: false });
      return Object.fromEntries(tags.flatMap(tag => {
        const value = data?.[tag];
        return (typeof value === 'number' && Number.isFinite(value)) || typeof value === 'string'
          ? [[tag, typeof value === 'string' ? value.slice(0, 200) : value]] : [];
      }));
    } catch { return {}; }
  }

  private async readAndVerifyVideo(
    stream: Readable,
    declared: DeclaredMediaFacts,
    config: MediaConfig,
  ): Promise<VerifiedMediaFacts> {
    const digest = createHash('sha256');
    let length = 0;
    let prefix: Buffer = Buffer.alloc(0);
    let scanTail: Buffer = Buffer.alloc(0);
    const containerProbe = new IsoBaseMediaProbe();
    let containerKind: 'ISO_BASE_MEDIA' | 'WEBM' | null = null;
    let undecidedBytes: Buffer = Buffer.alloc(0);
    let webmMetadata: Buffer = Buffer.alloc(0);
    let unsafeContent = false;
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      length += buffer.length;
      if (length > config.maxVideoTransportBytes) {
        throw new ApplicationError('MEDIA_SIZE_EXCEEDED', 413);
      }
      digest.update(buffer);
      if (prefix.length < 32) {
        prefix = Buffer.concat([prefix, buffer.subarray(0, 32 - prefix.length)]);
      }
      const scan = Buffer.concat([scanTail, buffer]);
      unsafeContent ||= scan.includes(EICAR);
      if (containerKind === null) {
        undecidedBytes = Buffer.concat([undecidedBytes, buffer]);
        if (
          undecidedBytes.length >= WEBM_SIGNATURE.length &&
          undecidedBytes.subarray(0, WEBM_SIGNATURE.length).equals(WEBM_SIGNATURE)
        ) {
          containerKind = 'WEBM';
          webmMetadata = this.appendBoundedMetadata(webmMetadata, undecidedBytes);
          undecidedBytes = Buffer.alloc(0);
        } else if (undecidedBytes.length >= 8) {
          if (undecidedBytes.subarray(4, 8).toString('ascii') !== 'ftyp') {
            this.integrityFailure();
          }
          containerKind = 'ISO_BASE_MEDIA';
          containerProbe.push(undecidedBytes);
          undecidedBytes = Buffer.alloc(0);
        }
      } else if (containerKind === 'ISO_BASE_MEDIA') {
        containerProbe.push(buffer);
      } else {
        webmMetadata = this.appendBoundedMetadata(webmMetadata, buffer);
      }
      scanTail = Buffer.from(scan.subarray(Math.max(0, scan.length - 64)));
    }
    if (length !== declared.fileSizeBytes || length < 32 || unsafeContent) this.integrityFailure();
    const contentSha256 = digest.digest('hex');
    if (declared.contentSha256 !== null && declared.contentSha256 !== contentSha256) {
      this.integrityFailure();
    }
    if (containerKind === null) return this.integrityFailure();
    let mimeType: string;
    let durationSeconds: number;
    let audioTrackCount: number;
    let videoTrackCount: number;
    let hasLocationMetadata: boolean;
    if (containerKind === 'ISO_BASE_MEDIA') {
      const parsed = containerProbe.finish();
      ({ audioTrackCount, videoTrackCount, hasLocationMetadata } = parsed);
      mimeType = this.isoBaseMediaMimeType(prefix.subarray(8, 12).toString('ascii'));
      const timing = this.parseMovieHeader(parsed.movieHeader);
      const seconds = Math.max(
        timing.duration / timing.timescale,
        parsed.fragmentDurationSeconds ?? 0,
      );
      if (seconds <= 0 || !Number.isFinite(seconds)) this.integrityFailure();
      this.enforceVideoDuration(declared.businessPurpose, seconds, 1);
      durationSeconds = Math.ceil(seconds);
    } else {
      const parsed = new WebmMetadataProbe().parse(webmMetadata);
      ({ audioTrackCount, videoTrackCount, hasLocationMetadata, durationSeconds } = parsed);
      mimeType = 'video/webm';
      this.enforceVideoDuration(declared.businessPurpose, durationSeconds, 1);
      durationSeconds = Math.ceil(durationSeconds);
    }
    if (hasLocationMetadata) this.locationMetadataFailure();
    if (videoTrackCount < 1) this.integrityFailure();
    if (mimeType !== declared.mimeType.toLowerCase()) this.integrityFailure();
    if (declared.businessPurpose === 'EXERCISE_RECORD' && audioTrackCount < 1) {
      throw new ApplicationError('MEDIA_AUDIO_TRACK_REQUIRED', 422);
    }
    if (declared.durationSeconds !== null && durationSeconds !== declared.durationSeconds) {
      this.integrityFailure();
    }
    return {
      mimeType,
      fileSizeBytes: length,
      contentSha256,
      durationSeconds,
      safeMetadata: { durationSeconds, audioTrackCount, videoTrackCount },
    };
  }

  private appendBoundedMetadata(current: Buffer, chunk: Buffer): Buffer {
    if (current.length >= MAX_VIDEO_METADATA_BYTES) return current;
    return Buffer.concat([current, chunk.subarray(0, MAX_VIDEO_METADATA_BYTES - current.length)]);
  }

  private parseImage(
    body: Buffer,
    maximumPixels: number,
  ): { mimeType: string; durationSeconds: null; safeMetadata: Record<string, number> } {
    let width = 0;
    let height = 0;
    let mimeType: string;
    if (
      body.length >= 33 &&
      body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      body.subarray(12, 16).toString('ascii') === 'IHDR' &&
      body.subarray(body.length - 8, body.length - 4).toString('ascii') === 'IEND'
    ) {
      mimeType = 'image/png';
      if (this.pngContainsLocationMetadata(body)) this.locationMetadataFailure();
      width = body.readUInt32BE(16);
      height = body.readUInt32BE(20);
    } else if (
      body.length >= 4 &&
      body[0] === 0xff &&
      body[1] === 0xd8
    ) {
      mimeType = 'image/jpeg';
      // Valid phone JPEGs may have an OEM trailer after EOI. The strict pixel
      // decoder below verifies completeness; EOI need not be the last bytes.
      const parsed = this.jpegInfo(body);
      if (parsed.hasLocationMetadata) this.locationMetadataFailure();
      ({ width, height } = parsed);
    } else if (
      body.length >= 20 &&
      body.toString('ascii', 0, 4) === 'RIFF' &&
      body.toString('ascii', 8, 12) === 'WEBP'
    ) {
      mimeType = 'image/webp';
      ({ width, height } = this.webpInfo(body));
    } else {
      return this.integrityFailure();
    }
    if (width < 1 || height < 1 || width * height > maximumPixels) this.integrityFailure();
    return { mimeType, durationSeconds: null, safeMetadata: { width, height } };
  }

  private webpInfo(body: Buffer): { width: number; height: number } {
    if (body.readUInt32LE(4) + 8 !== body.length) return this.integrityFailure();
    let offset = 12,
      width = 0,
      height = 0,
      hasImage = false;
    while (offset + 8 <= body.length) {
      const type = body.toString('ascii', offset, offset + 4),
        size = body.readUInt32LE(offset + 4);
      const start = offset + 8,
        end = start + size,
        next = end + (size & 1);
      if (next > body.length || ((size & 1) !== 0 && body[end] !== 0))
        return this.integrityFailure();
      const data = body.subarray(start, end);
      if (type === 'VP8X') {
        if (size !== 10 || width !== 0) return this.integrityFailure();
        width = data.readUIntLE(4, 3) + 1;
        height = data.readUIntLE(7, 3) + 1;
      } else if (type === 'VP8 ') {
        if (size < 10 || !data.subarray(3, 6).equals(Buffer.from([0x9d, 0x01, 0x2a])))
          return this.integrityFailure();
        const w = data.readUInt16LE(6) & 0x3fff,
          h = data.readUInt16LE(8) & 0x3fff;
        if (width !== 0 && (w !== width || h !== height)) return this.integrityFailure();
        width = w;
        height = h;
        hasImage = true;
      } else if (type === 'VP8L') {
        if (size < 5 || data[0] !== 0x2f) return this.integrityFailure();
        const bits = data.readUInt32LE(1),
          w = (bits & 0x3fff) + 1,
          h = ((bits >>> 14) & 0x3fff) + 1;
        if (bits >>> 29 !== 0 || (width !== 0 && (width !== w || height !== h)))
          return this.integrityFailure();
        width = w;
        height = h;
        hasImage = true;
      } else if (type === 'ANMF') {
        if (size < 24 || width === 0) return this.integrityFailure();
        hasImage = true;
      } else if (type === 'EXIF') {
        if (this.tiffContainsGpsIfd(data) || this.metadataPayloadContainsLocation(data))
          this.locationMetadataFailure();
      } else if (type === 'XMP ' && this.metadataPayloadContainsLocation(data))
        this.locationMetadataFailure();
      offset = next;
    }
    if (offset !== body.length || !hasImage || width < 1 || height < 1)
      return this.integrityFailure();
    return { width, height };
  }

  private jpegInfo(body: Buffer): {
    width: number;
    height: number;
    hasLocationMetadata: boolean;
  } {
    let offset = 2;
    let width = 0;
    let height = 0;
    let hasLocationMetadata = false;
    while (offset + 3 < body.length) {
      if (body[offset] !== 0xff) return this.integrityFailure();
      while (body[offset] === 0xff) offset += 1;
      const marker = body[offset] ?? 0;
      offset += 1;
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      if (offset + 2 > body.length) return this.integrityFailure();
      const segmentLength = body.readUInt16BE(offset);
      if (segmentLength < 2 || offset + segmentLength > body.length) this.integrityFailure();
      const payload = body.subarray(offset + 2, offset + segmentLength);
      if (marker === 0xe1 || marker === 0xed || marker === 0xfe) {
        hasLocationMetadata ||= this.metadataPayloadContainsLocation(payload);
      }
      if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
        if (segmentLength < 7) this.integrityFailure();
        height = body.readUInt16BE(offset + 3);
        width = body.readUInt16BE(offset + 5);
      }
      offset += segmentLength;
    }
    if (width < 1 || height < 1) return this.integrityFailure();
    return { width, height, hasLocationMetadata };
  }

  private pngContainsLocationMetadata(body: Buffer): boolean {
    let offset = 8;
    while (offset + 12 <= body.length) {
      const length = body.readUInt32BE(offset);
      const type = body.subarray(offset + 4, offset + 8).toString('ascii');
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      if (dataEnd + 4 > body.length) return this.integrityFailure();
      const payload = body.subarray(dataStart, dataEnd);
      if (type === 'eXIf' && this.tiffContainsGpsIfd(payload)) return true;
      if (['tEXt', 'zTXt', 'iTXt'].includes(type)) {
        const keywordEnd = payload.indexOf(0);
        const keyword = payload
          .subarray(0, keywordEnd < 0 ? payload.length : keywordEnd)
          .toString('latin1')
          .toLowerCase();
        if (this.locationTermsPresent(keyword)) return true;
        if (
          type !== 'zTXt' &&
          this.locationTermsPresent(payload.toString('latin1').toLowerCase())
        ) {
          return true;
        }
      }
      offset = dataEnd + 4;
      if (type === 'IEND') return false;
    }
    return this.integrityFailure();
  }

  private metadataPayloadContainsLocation(payload: Buffer): boolean {
    if (
      payload.length >= 6 &&
      payload.subarray(0, 6).equals(Buffer.from([0x45, 0x78, 0x69, 0x66, 0, 0])) &&
      this.tiffContainsGpsIfd(payload.subarray(6))
    ) {
      return true;
    }
    return this.locationTermsPresent(payload.toString('latin1').toLowerCase());
  }

  private tiffContainsGpsIfd(tiff: Buffer): boolean {
    if (tiff.length < 8) return false;
    const byteOrder = tiff.subarray(0, 2).toString('ascii');
    if (byteOrder !== 'II' && byteOrder !== 'MM') return false;
    const littleEndian = byteOrder === 'II';
    const readUInt16 = (offset: number): number | null => {
      if (offset < 0 || offset + 2 > tiff.length) return null;
      return littleEndian ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset);
    };
    const readUInt32 = (offset: number): number | null => {
      if (offset < 0 || offset + 4 > tiff.length) return null;
      return littleEndian ? tiff.readUInt32LE(offset) : tiff.readUInt32BE(offset);
    };
    if (readUInt16(2) !== 42) return false;
    let ifdOffset = readUInt32(4);
    const visited = new Set<number>();
    for (let depth = 0; depth < 8 && ifdOffset !== null && ifdOffset !== 0; depth += 1) {
      if (visited.has(ifdOffset)) return false;
      visited.add(ifdOffset);
      const entryCount = readUInt16(ifdOffset);
      if (entryCount === null || entryCount > 4096) return false;
      const entriesStart = ifdOffset + 2;
      const nextOffsetPosition = entriesStart + entryCount * 12;
      if (nextOffsetPosition + 4 > tiff.length) return false;
      for (let index = 0; index < entryCount; index += 1) {
        if (readUInt16(entriesStart + index * 12) === 0x8825) return true;
      }
      ifdOffset = readUInt32(nextOffsetPosition);
    }
    return false;
  }

  private locationTermsPresent(value: string): boolean {
    return LOCATION_METADATA_TERMS.some((term) => value.includes(term));
  }

  private parseMovieHeader(header: Buffer): { timescale: number; duration: number } {
    const version = header[4];
    let timescale: number;
    let duration: number;
    if (version === 0) {
      timescale = header.readUInt32BE(16);
      duration = header.readUInt32BE(20);
    } else if (version === 1) {
      timescale = header.readUInt32BE(24);
      const raw = header.readBigUInt64BE(28);
      if (raw > BigInt(Number.MAX_SAFE_INTEGER)) return this.integrityFailure();
      duration = Number(raw);
    } else {
      return this.integrityFailure();
    }
    if (timescale < 1) return this.integrityFailure();
    return { timescale, duration };
  }

  private isoBaseMediaMimeType(brand: string): string {
    if (brand === 'qt  ') return 'video/quicktime';
    if (brand.toLowerCase().startsWith('3g')) return 'video/3gpp';
    return 'video/mp4';
  }

  private enforceVideoDuration(businessPurpose: string, duration: number, timescale: number): void {
    const maximum =
      businessPurpose === 'EXERCISE_RECORD'
        ? MAX_EXERCISE_VIDEO_DURATION_SECONDS
        : MAX_NON_EXERCISE_VIDEO_DURATION_SECONDS;
    if (duration > maximum * timescale) {
      throw new ApplicationError('MEDIA_VIDEO_DURATION_EXCEEDED', 422);
    }
  }

  private integrityFailure(): never {
    throw new ApplicationError('MEDIA_INTEGRITY_MISMATCH', 422);
  }

  private locationMetadataFailure(): never {
    throw new ApplicationError('MEDIA_LOCATION_METADATA_NOT_ALLOWED', 422);
  }
}

interface WebmFacts {
  durationSeconds: number;
  audioTrackCount: number;
  videoTrackCount: number;
  hasLocationMetadata: boolean;
}

interface EbmlElement {
  id: number;
  dataStart: number;
  dataEnd: number;
  nextOffset: number;
}

class WebmMetadataProbe {
  parse(buffer: Buffer): WebmFacts {
    const header = this.element(buffer, 0, buffer.length);
    if (header.id !== 0x1a45dfa3) this.invalid();
    const headerChildren = this.children(buffer, header.dataStart, header.dataEnd);
    const documentType = headerChildren.find(({ id }) => id === 0x4282);
    if (
      documentType === undefined ||
      buffer.subarray(documentType.dataStart, documentType.dataEnd).toString('ascii') !== 'webm'
    ) {
      this.invalid();
    }
    const segment = this.element(buffer, header.nextOffset, buffer.length, true);
    if (segment.id !== 0x18538067) this.invalid();

    let durationSeconds: number | null = null;
    let audioTrackCount = 0;
    let videoTrackCount = 0;
    let hasLocationMetadata = false;
    let offset = segment.dataStart;
    while (offset < segment.dataEnd) {
      const child = this.element(buffer, offset, segment.dataEnd, true);
      if (child.id === 0x1f43b675) break;
      if (child.id === 0x1549a966) {
        durationSeconds = this.duration(buffer, child);
      } else if (child.id === 0x1654ae6b) {
        ({ audioTrackCount, videoTrackCount } = this.tracks(buffer, child));
      } else if (child.id === 0x1254c367) {
        const metadata = buffer
          .subarray(child.dataStart, child.dataEnd)
          .toString('utf8')
          .toLowerCase();
        hasLocationMetadata = LOCATION_METADATA_TERMS.some((term) => metadata.includes(term));
      }
      offset = child.nextOffset;
    }
    if (
      durationSeconds === null ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0 ||
      videoTrackCount + audioTrackCount < 1
    ) {
      this.invalid();
    }
    return { durationSeconds, audioTrackCount, videoTrackCount, hasLocationMetadata };
  }

  private duration(buffer: Buffer, info: EbmlElement): number {
    let timecodeScale = 1_000_000;
    let durationUnits: number | null = null;
    for (const child of this.children(buffer, info.dataStart, info.dataEnd)) {
      if (child.id === 0x2ad7b1) {
        timecodeScale = this.unsigned(buffer.subarray(child.dataStart, child.dataEnd));
      } else if (child.id === 0x4489) {
        const value = buffer.subarray(child.dataStart, child.dataEnd);
        if (value.length === 4) durationUnits = value.readFloatBE(0);
        else if (value.length === 8) durationUnits = value.readDoubleBE(0);
        else this.invalid();
      }
    }
    if (durationUnits === null || timecodeScale < 1) return this.invalid();
    return (durationUnits * timecodeScale) / 1_000_000_000;
  }

  private tracks(
    buffer: Buffer,
    tracks: EbmlElement,
  ): { audioTrackCount: number; videoTrackCount: number } {
    let audioTrackCount = 0;
    let videoTrackCount = 0;
    for (const entry of this.children(buffer, tracks.dataStart, tracks.dataEnd)) {
      if (entry.id !== 0xae) continue;
      const type = this.children(buffer, entry.dataStart, entry.dataEnd).find(
        ({ id }) => id === 0x83,
      );
      if (type === undefined) this.invalid();
      const value = this.unsigned(buffer.subarray(type.dataStart, type.dataEnd));
      if (value === 1) videoTrackCount += 1;
      if (value === 2) audioTrackCount += 1;
    }
    return { audioTrackCount, videoTrackCount };
  }

  private children(buffer: Buffer, start: number, end: number): EbmlElement[] {
    const result: EbmlElement[] = [];
    let offset = start;
    while (offset < end) {
      const child = this.element(buffer, offset, end);
      result.push(child);
      offset = child.nextOffset;
    }
    if (offset !== end) this.invalid();
    return result;
  }

  private element(
    buffer: Buffer,
    offset: number,
    end: number,
    allowUnknownSize = false,
  ): EbmlElement {
    const id = this.vint(buffer, offset, end, false);
    const size = this.vint(buffer, offset + id.length, end, true);
    const dataStart = offset + id.length + size.length;
    const declaredEnd = dataStart + size.value;
    const dataEnd = allowUnknownSize && (size.unknown || declaredEnd > end) ? end : declaredEnd;
    if ((!allowUnknownSize && size.unknown) || dataEnd > end || dataEnd < dataStart) this.invalid();
    return { id: id.value, dataStart, dataEnd, nextOffset: dataEnd };
  }

  private vint(
    buffer: Buffer,
    offset: number,
    end: number,
    isSize: boolean,
  ): { value: number; length: number; unknown: boolean } {
    if (offset >= end) this.invalid();
    const first = buffer[offset] ?? 0;
    let length = 1;
    let marker = 0x80;
    while (length <= 8 && (first & marker) === 0) {
      marker >>= 1;
      length += 1;
    }
    if (length > (isSize ? 8 : 4) || offset + length > end) this.invalid();
    let value = isSize ? first & (marker - 1) : first;
    let unknown = isSize && value === marker - 1;
    for (let index = 1; index < length; index += 1) {
      const byte = buffer[offset + index] ?? 0;
      value = value * 256 + byte;
      unknown &&= byte === 0xff;
      if (!Number.isSafeInteger(value)) this.invalid();
    }
    return { value, length, unknown };
  }

  private unsigned(value: Buffer): number {
    if (value.length < 1 || value.length > 6) return this.invalid();
    let result = 0;
    for (const byte of value) result = result * 256 + byte;
    return result;
  }

  private invalid(): never {
    throw new ApplicationError('MEDIA_INTEGRITY_MISMATCH', 422);
  }
}

interface IsoBox {
  type: string;
  start: number;
  headerSize: number;
  end: number;
}

class IsoBaseMediaProbe {
  private pending = Buffer.alloc(0);
  private remainingSkipBytes = 0;
  private skipToEndOfFile = false;
  private movieBox: Buffer | null = null;
  private fragmentBoxes: Buffer[] = [];
  private fragmentMetadataBytes = 0;

  push(chunk: Buffer): void {
    if (this.skipToEndOfFile) return;
    const input = this.pending.length === 0 ? chunk : Buffer.concat([this.pending, chunk]);
    this.pending = Buffer.alloc(0);
    let offset = 0;
    while (offset < input.length) {
      if (this.remainingSkipBytes > 0) {
        const consumed = Math.min(this.remainingSkipBytes, input.length - offset);
        offset += consumed;
        this.remainingSkipBytes -= consumed;
        continue;
      }
      const parsed = this.readBox(input, offset, input.length, true);
      if (parsed === null) {
        this.pending = Buffer.from(input.subarray(offset));
        if (this.pending.length > MAX_VIDEO_METADATA_BYTES) this.invalid();
        return;
      }
      if (parsed.type === 'EOF_MDAT') {
        this.skipToEndOfFile = true;
        return;
      }
      const boxSize = parsed.end - parsed.start;
      const available = input.length - offset;
      if (parsed.type === 'moov' || parsed.type === 'moof') {
        if (boxSize > MAX_VIDEO_METADATA_BYTES) this.invalid();
        if (available < boxSize) {
          this.pending = Buffer.from(input.subarray(offset));
          return;
        }
        const metadata = Buffer.from(input.subarray(offset, offset + boxSize));
        if (parsed.type === 'moov') {
          if (this.movieBox !== null) this.invalid();
          this.movieBox = metadata;
        } else {
          this.fragmentMetadataBytes += boxSize;
          if (this.fragmentMetadataBytes > MAX_VIDEO_METADATA_BYTES) this.invalid();
          this.fragmentBoxes.push(metadata);
        }
        offset += boxSize;
        continue;
      }
      const consumed = Math.min(available, boxSize);
      offset += consumed;
      this.remainingSkipBytes = boxSize - consumed;
    }
  }

  finish(): {
    movieHeader: Buffer;
    audioTrackCount: number;
    videoTrackCount: number;
    hasLocationMetadata: boolean;
    fragmentDurationSeconds: number | null;
  } {
    if (
      this.movieBox === null ||
      this.remainingSkipBytes !== 0 ||
      (!this.skipToEndOfFile && this.pending.length !== 0)
    ) {
      return this.invalid();
    }
    const root = this.readBoxes(this.movieBox, 0, this.movieBox.length);
    if (root.length !== 1 || root[0]?.type !== 'moov') return this.invalid();
    const movie = root[0];
    const children = this.readBoxes(this.movieBox, movie.start + movie.headerSize, movie.end);
    const movieHeaderBox = children.find((box) => box.type === 'mvhd');
    if (movieHeaderBox === undefined || movieHeaderBox.end - movieHeaderBox.start < 44) {
      return this.invalid();
    }
    const movieHeader = Buffer.from(
      this.movieBox.subarray(movieHeaderBox.start + 4, movieHeaderBox.start + 44),
    );
    const handlerTypes = children
      .filter((box) => box.type === 'trak')
      .map((track) => this.trackHandlerType(this.movieBox!, track));
    const audioTrackCount = handlerTypes.filter((type) => type === 'soun').length;
    const videoTrackCount = handlerTypes.filter((type) => type === 'vide').length;
    const metadataText = this.movieBox.toString('latin1').toLowerCase();
    const hasLocationMetadata =
      this.movieBox.includes(Buffer.from([0xa9, 0x78, 0x79, 0x7a])) ||
      metadataText.includes('location') ||
      metadataText.includes('loci');
    const fragmentDurationSeconds = this.fragmentDuration(this.movieBox, children);
    return {
      movieHeader,
      audioTrackCount,
      videoTrackCount,
      hasLocationMetadata,
      fragmentDurationSeconds,
    };
  }

  // MediaRecorder emits valid fragmented MP4 with mvhd duration zero. Derive
  // duration from the actual track/sample timeline, never the client declaration.
  private fragmentDuration(movie: Buffer, children: IsoBox[]): number | null {
    if (this.fragmentBoxes.length === 0) return null;
    const tracks = new Map<number, { scale: number; defaultDuration: number }>();
    const payload = (buffer: Buffer, box: IsoBox): Buffer =>
      buffer.subarray(box.start + box.headerSize, box.end);
    const uint = (buffer: Buffer, offset: number): number => {
      if (offset < 0 || offset + 4 > buffer.length) this.invalid();
      return buffer.readUInt32BE(offset);
    };
    const wide = (buffer: Buffer, offset: number): number => {
      if (offset < 0 || offset + 8 > buffer.length) this.invalid();
      const value = buffer.readBigUInt64BE(offset);
      if (value > BigInt(Number.MAX_SAFE_INTEGER)) this.invalid();
      return Number(value);
    };
    for (const track of children.filter((box) => box.type === 'trak')) {
      const parts = this.readBoxes(movie, track.start + track.headerSize, track.end);
      const header = parts.find((box) => box.type === 'tkhd');
      const media = parts.find((box) => box.type === 'mdia');
      if (!header || !media) this.invalid();
      const clock = this.readBoxes(movie, media.start + media.headerSize, media.end).find(
        (box) => box.type === 'mdhd',
      );
      if (!clock) this.invalid();
      const head = payload(movie, header),
        timing = payload(movie, clock);
      if (![0, 1].includes(head[0]!) || ![0, 1].includes(timing[0]!)) this.invalid();
      const id = uint(head, head[0] === 1 ? 20 : 12),
        scale = uint(timing, timing[0] === 1 ? 20 : 12);
      if (id < 1 || scale < 1 || tracks.has(id)) this.invalid();
      tracks.set(id, { scale, defaultDuration: 0 });
    }
    for (const extensions of children.filter((box) => box.type === 'mvex')) {
      for (const box of this.readBoxes(
        movie,
        extensions.start + extensions.headerSize,
        extensions.end,
      )) {
        if (box.type !== 'trex') continue;
        const data = payload(movie, box),
          track = tracks.get(uint(data, 4));
        if (!track) this.invalid();
        track.defaultDuration = uint(data, 12);
      }
    }
    let maximum = 0,
      samples = 0;
    for (const fragment of this.fragmentBoxes) {
      const root = this.readBoxes(fragment, 0, fragment.length)[0]!;
      for (const traf of this.readBoxes(fragment, root.headerSize, root.end).filter(
        (box) => box.type === 'traf',
      )) {
        const parts = this.readBoxes(fragment, traf.start + traf.headerSize, traf.end);
        const header = parts.find((box) => box.type === 'tfhd'),
          clock = parts.find((box) => box.type === 'tfdt');
        if (!header || !clock) this.invalid();
        const head = payload(fragment, header),
          flags = uint(head, 0) & 0xffffff;
        const track = tracks.get(uint(head, 4));
        if (!track) this.invalid();
        let offset = 8 + (flags & 1 ? 8 : 0) + (flags & 2 ? 4 : 0);
        const defaultDuration = flags & 8 ? uint(head, offset) : track.defaultDuration;
        if (flags & 8) offset += 4;
        if (flags & 0x10) offset += 4;
        if (flags & 0x20) offset += 4;
        if (offset !== head.length) this.invalid();
        const timing = payload(fragment, clock);
        if (![0, 1].includes(timing[0]!)) this.invalid();
        let decode = timing[0] === 1 ? wide(timing, 4) : uint(timing, 4);
        for (const run of parts.filter((box) => box.type === 'trun')) {
          const data = payload(fragment, run),
            runFlags = uint(data, 0) & 0xffffff,
            count = uint(data, 4);
          if (![0, 1].includes(data[0]!) || count + samples > 1_000_000) this.invalid();
          let cursor = 8 + (runFlags & 1 ? 4 : 0) + (runFlags & 4 ? 4 : 0);
          for (let index = 0; index < count; index++) {
            const duration = runFlags & 0x100 ? uint(data, cursor) : defaultDuration;
            if (runFlags & 0x100) cursor += 4;
            if (runFlags & 0x200) cursor += 4;
            if (runFlags & 0x400) cursor += 4;
            let composition = 0;
            if (runFlags & 0x800) {
              composition = uint(data, cursor);
              if (data[0] === 1) composition |= 0;
              cursor += 4;
            }
            if (
              duration < 1 ||
              cursor > data.length ||
              !Number.isSafeInteger(decode + duration + composition)
            )
              this.invalid();
            maximum = Math.max(maximum, (decode + composition + duration) / track.scale);
            decode += duration;
            samples++;
          }
          if (cursor !== data.length) this.invalid();
        }
      }
    }
    if (samples === 0 || maximum <= 0) this.invalid();
    return maximum;
  }

  private trackHandlerType(buffer: Buffer, track: IsoBox): string | null {
    const trackChildren = this.readBoxes(buffer, track.start + track.headerSize, track.end);
    for (const media of trackChildren.filter((box) => box.type === 'mdia')) {
      const mediaChildren = this.readBoxes(buffer, media.start + media.headerSize, media.end);
      for (const handler of mediaChildren.filter((box) => box.type === 'hdlr')) {
        const handlerTypeStart = handler.start + handler.headerSize + 8;
        if (handlerTypeStart + 4 <= handler.end) {
          return buffer.subarray(handlerTypeStart, handlerTypeStart + 4).toString('ascii');
        }
      }
    }
    return null;
  }

  private readBoxes(buffer: Buffer, start: number, end: number): IsoBox[] {
    const boxes: IsoBox[] = [];
    let offset = start;
    while (offset < end) {
      const box = this.readBox(buffer, offset, end, false);
      if (box === null || box.type === 'EOF_MDAT') return this.invalid();
      boxes.push(box);
      offset = box.end;
    }
    return boxes;
  }

  private readBox(
    buffer: Buffer,
    start: number,
    end: number,
    allowIncomplete: boolean,
  ): IsoBox | null {
    if (end - start < 8) return allowIncomplete ? null : this.invalid();
    const size32 = buffer.readUInt32BE(start);
    const type = buffer.subarray(start + 4, start + 8).toString('ascii');
    let headerSize = 8;
    let boxSize: number;
    if (size32 === 1) {
      if (end - start < 16) return allowIncomplete ? null : this.invalid();
      const size64 = buffer.readBigUInt64BE(start + 8);
      if (size64 > BigInt(Number.MAX_SAFE_INTEGER)) return this.invalid();
      headerSize = 16;
      boxSize = Number(size64);
    } else if (size32 === 0) {
      if (allowIncomplete && type === 'mdat') {
        return { type: 'EOF_MDAT', start, headerSize, end };
      }
      boxSize = end - start;
    } else {
      boxSize = size32;
    }
    if (boxSize < headerSize) return this.invalid();
    if (!allowIncomplete && start + boxSize > end) return this.invalid();
    return { type, start, headerSize, end: start + boxSize };
  }

  private invalid(): never {
    throw new ApplicationError('MEDIA_INTEGRITY_MISMATCH', 422);
  }
}
