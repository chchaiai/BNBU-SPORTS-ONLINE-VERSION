import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { describe, it } from 'node:test';

import type { MediaConfig } from '../../src/common/config/environment.js';
import { ApplicationError } from '../../src/common/errors/application-error.js';
import { MediaValidator } from '../../src/modules/media/application/media-validator.js';

const config: MediaConfig = {
  storage: {
    endpoint: 'http://storage.test:9000',
    region: 'us-east-1',
    bucket: 'synthetic-media-private',
    credentials: {
      provider: 'STATIC',
      accessKey: 'synthetic-access',
      secretKey: 'synthetic-secret-never-production',
    },
    forcePathStyle: true,
  },
  uploadUrlTtlSeconds: 300,
  accessUrlTtlSeconds: 300,
  maxImageBytes: 10_000,
  maxImagePixels: 1_000_000,
  maxVideoTransportBytes: 536_870_912,
  scannerMode: 'TEST_SIGNATURE',
  workerEnabled: false,
  workerPollMs: 500,
};

it('accepts WebP declarations for certification images but not exercise evidence', () => {
  const validator = new MediaValidator();
  const facts = {
    businessPurpose: 'EXEMPTION_APPLICATION',
    mediaType: 'IMAGE',
    mimeType: 'image/webp',
    fileSizeBytes: 100,
    contentSha256: null,
    durationSeconds: null,
  };
  assert.doesNotThrow(() => validator.validateDeclaration(facts, config));
  assert.throws(() =>
    validator.validateDeclaration({ ...facts, businessPurpose: 'EXERCISE_RECORD' }, config),
  );
});

for (const fixture of ['sample-lossy.webp', 'sample-lossless.webp']) {
  it(`reads actual certification WebP dimensions: ${fixture}`, async () => {
    const body = readFileSync(new URL(`../fixtures/v81-media/${fixture}`, import.meta.url));
    const verified = await new MediaValidator().readAndVerify(
      Readable.from([body]),
      {
        businessPurpose: 'EXEMPTION_APPLICATION',
        mediaType: 'IMAGE',
        mimeType: 'image/webp',
        fileSizeBytes: body.length,
        contentSha256: createHash('sha256').update(body).digest('hex'),
        durationSeconds: null,
      },
      config,
    );
    assert.equal(verified.mimeType, 'image/webp');
    assert.deepEqual(verified.safeMetadata, { width: 3, height: 2 });
  });

  it(`rejects truncated certification WebP even with matching transport digest: ${fixture}`, async () => {
    const body = readFileSync(
      new URL(`../fixtures/v81-media/${fixture}`, import.meta.url),
    ).subarray(0, -1);
    await assert.rejects(
      new MediaValidator().readAndVerify(
        Readable.from([body]),
        {
          businessPurpose: 'EXEMPTION_APPLICATION',
          mediaType: 'IMAGE',
          mimeType: 'image/webp',
          fileSizeBytes: body.length,
          contentSha256: createHash('sha256').update(body).digest('hex'),
          durationSeconds: null,
        },
        config,
      ),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'MEDIA_INTEGRITY_MISMATCH',
    );
  });
}

function png(): Buffer {
  return readFileSync(new URL('../fixtures/v81-media/sample.png', import.meta.url));
}

it('verifies native MediaRecorder fragmented MP4 with zero movie duration across stream boundaries', async () => {
  const body = readFileSync(
    new URL('../fixtures/v81-media/media-recorder-fragmented.mp4', import.meta.url),
  );
  const chunks = Array.from({ length: Math.ceil(body.length / 97) }, (_, index) =>
    body.subarray(index * 97, (index + 1) * 97),
  );
  const verified = await new MediaValidator().readAndVerify(
    Readable.from(chunks),
    {
      businessPurpose: 'EXERCISE_RECORD',
      mediaType: 'VIDEO',
      mimeType: 'video/mp4',
      fileSizeBytes: body.length,
      contentSha256: createHash('sha256').update(body).digest('hex'),
      durationSeconds: 11,
    },
    config,
  );
  assert.deepEqual(verified.safeMetadata, {
    durationSeconds: 11,
    audioTrackCount: 1,
    videoTrackCount: 1,
  });
});

for (const mutation of [
  'missing-fragments',
  'excessive-samples',
  'excessive-duration',
  'truncated',
] as const) {
  it(`rejects invalid fragmented MP4 timelines: ${mutation}`, async () => {
    let body = readFileSync(
      new URL('../fixtures/v81-media/media-recorder-fragmented.mp4', import.meta.url),
    );
    const moof = body.indexOf(Buffer.from('moof'));
    const run = body.indexOf(Buffer.from('trun'));
    const clock = body.indexOf(Buffer.from('tfdt'));
    assert.ok(moof > 0 && run > 0 && clock > 0);
    if (mutation === 'missing-fragments') body = body.subarray(0, moof - 4);
    if (mutation === 'truncated') body = body.subarray(0, -1);
    if (mutation === 'excessive-samples') body.writeUInt32BE(1_000_001, run + 8);
    if (mutation === 'excessive-duration') {
      if (body[clock + 4] === 1) body.writeBigUInt64BE(1_000_000_000n, clock + 8);
      else body.writeUInt32BE(1_000_000_000, clock + 8);
    }
    await assert.rejects(
      new MediaValidator().readAndVerify(
        Readable.from([body]),
        {
          businessPurpose: 'EXERCISE_RECORD',
          mediaType: 'VIDEO',
          mimeType: 'video/mp4',
          fileSizeBytes: body.length,
          contentSha256: createHash('sha256').update(body).digest('hex'),
          durationSeconds: 11,
        },
        config,
      ),
      (error: unknown) =>
        error instanceof ApplicationError &&
        ['MEDIA_INTEGRITY_MISMATCH', 'MEDIA_VIDEO_DURATION_EXCEEDED'].includes(error.code),
    );
  });
}

it('rejects WebP with valid container lengths and image dimensions but missing compressed pixels', async () => {
  const original = readFileSync(
    new URL('../fixtures/v81-media/sample-lossless.webp', import.meta.url),
  );
  const body = Buffer.from(original.subarray(0, 26));
  body.writeUInt32LE(body.length - 8, 4);
  body.writeUInt32LE(5, 16);
  body[25] = 0;
  await assert.rejects(
    new MediaValidator().readAndVerify(
      Readable.from([body]),
      {
        businessPurpose: 'EXEMPTION_APPLICATION',
        mediaType: 'IMAGE',
        mimeType: 'image/webp',
        fileSizeBytes: body.length,
        contentSha256: createHash('sha256').update(body).digest('hex'),
        durationSeconds: null,
      },
      config,
    ),
    (error: unknown) =>
      error instanceof ApplicationError && error.code === 'MEDIA_INTEGRITY_MISMATCH',
  );
});

function jpeg(options: { hasGps?: boolean; commentContainsGpsTagBytes?: boolean } = {}): Buffer {
  const segment = (marker: number, payload: Buffer): Buffer => {
    const value = Buffer.alloc(4 + payload.length);
    value[0] = 0xff;
    value[1] = marker;
    value.writeUInt16BE(payload.length + 2, 2);
    payload.copy(value, 4);
    return value;
  };
  const image = readFileSync(new URL('../fixtures/v81-media/sample.jpg', import.meta.url));
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])];
  if (options.hasGps === true) {
    const tiff = Buffer.alloc(26);
    tiff.write('II', 0, 'ascii');
    tiff.writeUInt16LE(42, 2);
    tiff.writeUInt32LE(8, 4);
    tiff.writeUInt16LE(1, 8);
    tiff.writeUInt16LE(0x8825, 10);
    tiff.writeUInt16LE(4, 12);
    tiff.writeUInt32LE(1, 14);
    tiff.writeUInt32LE(0, 18);
    tiff.writeUInt32LE(0, 22);
    parts.push(segment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff])));
  }
  if (options.commentContainsGpsTagBytes === true) {
    parts.push(segment(0xfe, Buffer.from([0x10, 0x25, 0x88, 0x20])));
  }
  parts.push(image.subarray(2));
  return Buffer.concat(parts);
}

function mp4(
  durationMilliseconds: number,
  options: {
    hasAudio?: boolean;
    spoofAudioInMediaData?: boolean;
    hasLocationMetadata?: boolean;
    locationTextInMediaData?: boolean;
  } = {},
): Buffer {
  const box = (type: string, payload: Buffer): Buffer => {
    const value = Buffer.alloc(8 + payload.length);
    value.writeUInt32BE(value.length, 0);
    value.write(type, 4, 'ascii');
    payload.copy(value, 8);
    return value;
  };
  const fileTypePayload = Buffer.alloc(16);
  fileTypePayload.write('isom', 0, 'ascii');
  fileTypePayload.write('isom', 8, 'ascii');
  const movieHeaderPayload = Buffer.alloc(36);
  movieHeaderPayload.writeUInt32BE(1_000, 12);
  movieHeaderPayload.writeUInt32BE(durationMilliseconds, 16);
  const track = (handlerType: 'vide' | 'soun'): Buffer => {
    const handlerPayload = Buffer.alloc(24);
    handlerPayload.write(handlerType, 8, 'ascii');
    return box('trak', box('mdia', box('hdlr', handlerPayload)));
  };
  const tracks = [track('vide')];
  if (options.hasAudio !== false) tracks.push(track('soun'));
  const metadata =
    options.hasLocationMetadata === true ? [box('\xa9xyz', Buffer.from('+39.9+116.4/'))] : [];
  const movie = box(
    'moov',
    Buffer.concat([box('mvhd', movieHeaderPayload), ...tracks, ...metadata]),
  );
  const mediaDataPayload = options.spoofAudioInMediaData
    ? Buffer.from([
        0, 0, 0, 32, 0x68, 0x64, 0x6c, 0x72, 0, 0, 0, 0, 0, 0, 0, 0, 0x73, 0x6f, 0x75, 0x6e,
      ])
    : options.locationTextInMediaData === true
      ? Buffer.from('location')
      : Buffer.alloc(4);
  return Buffer.concat([box('ftyp', fileTypePayload), movie, box('mdat', mediaDataPayload)]);
}

function webm(
  durationSeconds: number,
  options: { hasAudio?: boolean; hasLocationMetadata?: boolean } = {},
): Buffer {
  const id = (hex: string): Buffer => Buffer.from(hex, 'hex');
  const size = (value: number): Buffer => {
    if (value <= 0x7e) return Buffer.from([0x80 | value]);
    if (value <= 0x3ffe) return Buffer.from([0x40 | (value >> 8), value & 0xff]);
    throw new Error('Synthetic WebM element is too large');
  };
  const element = (elementId: string, payload: Buffer): Buffer =>
    Buffer.concat([id(elementId), size(payload.length), payload]);
  const unsigned = (value: number): Buffer => Buffer.from([value]);
  const duration = Buffer.alloc(8);
  duration.writeDoubleBE(durationSeconds * 1000, 0);
  const info = element(
    '1549a966',
    Buffer.concat([element('2ad7b1', Buffer.from([0x0f, 0x42, 0x40])), element('4489', duration)]),
  );
  const track = (type: number): Buffer => element('ae', element('83', unsigned(type)));
  const trackEntries = [track(1)];
  if (options.hasAudio !== false) trackEntries.push(track(2));
  const tracks = element('1654ae6b', Buffer.concat(trackEntries));
  const tags =
    options.hasLocationMetadata === true
      ? element('1254c367', element('7373', Buffer.from('GPSLatitude', 'utf8')))
      : Buffer.alloc(0);
  const cluster = element('1f43b675', Buffer.alloc(16));
  const header = element('1a45dfa3', element('4282', Buffer.from('webm', 'ascii')));
  return Buffer.concat([header, element('18538067', Buffer.concat([info, tracks, tags, cluster]))]);
}

describe('MediaEvidence validation core', () => {
  it('separates declarations from verified image facts and computes SHA-256 from bytes', async () => {
    const body = png();
    const digest = createHash('sha256').update(body).digest('hex');
    const validator = new MediaValidator();
    const verified = await validator.readAndVerify(
      Readable.from(body),
      {
        businessPurpose: 'EXERCISE_RECORD',
        mediaType: 'IMAGE',
        mimeType: 'image/png',
        fileSizeBytes: body.length,
        contentSha256: digest,
        durationSeconds: null,
      },
      config,
    );
    assert.equal(verified.mimeType, 'image/png');
    assert.equal(verified.fileSizeBytes, body.length);
    assert.equal(verified.contentSha256, digest);
    assert.equal(verified.durationSeconds, null);
    assert.deepEqual(verified.safeMetadata, { width: 2, height: 3 });
  });

  it('accepts JPEG comment bytes that resemble a GPS tag but rejects a real GPS IFD', async () => {
    const validator = new MediaValidator();
    const ordinary = jpeg({ commentContainsGpsTagBytes: true });
    const verified = await validator.readAndVerify(
      Readable.from(ordinary),
      {
        businessPurpose: 'EXERCISE_RECORD',
        mediaType: 'IMAGE',
        mimeType: 'image/jpeg',
        fileSizeBytes: ordinary.length,
        contentSha256: null,
        durationSeconds: null,
      },
      config,
    );
    assert.deepEqual(verified.safeMetadata, { width: 2, height: 3 });

    const located = jpeg({ hasGps: true });
    await assert.rejects(
      validator.readAndVerify(
        Readable.from(located),
        {
          businessPurpose: 'EXERCISE_RECORD',
          mediaType: 'IMAGE',
          mimeType: 'image/jpeg',
          fileSizeBytes: located.length,
          contentSha256: null,
          durationSeconds: null,
        },
        config,
      ),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'MEDIA_LOCATION_METADATA_NOT_ALLOWED',
    );
  });

  it('rejects MIME spoofing, byte-size mismatches, location metadata, and the test signature', async () => {
    const validator = new MediaValidator();
    for (const [body, mimeType, size] of [
      [png(), 'image/jpeg', png().length],
      [png(), 'image/png', png().length + 1],
      [Buffer.concat([png(), Buffer.from('GPS')]), 'image/png', png().length + 3],
      [
        Buffer.concat([png(), Buffer.from('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')]),
        'image/png',
        png().length + 34,
      ],
    ] as const) {
      await assert.rejects(
        validator.readAndVerify(
          Readable.from(body),
          {
            businessPurpose: 'EXERCISE_RECORD',
            mediaType: 'IMAGE',
            mimeType,
            fileSizeBytes: size,
            contentSha256: null,
            durationSeconds: null,
          },
          config,
        ),
        (error: unknown) =>
          error instanceof ApplicationError && error.code === 'MEDIA_INTEGRITY_MISMATCH',
      );
    }
  });

  it('keeps image limits while replacing exercise-video size rules with a fixed 15-second cap', () => {
    const validator = new MediaValidator();
    assert.throws(
      () =>
        validator.validateDeclaration(
          {
            businessPurpose: 'EXERCISE_RECORD',
            mediaType: 'IMAGE',
            mimeType: 'image/gif',
            fileSizeBytes: 100,
            contentSha256: null,
            durationSeconds: null,
          },
          config,
        ),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'MEDIA_TYPE_NOT_ALLOWED',
    );
    assert.throws(() =>
      validator.validateDeclaration(
        {
          businessPurpose: 'EXERCISE_RECORD',
          mediaType: 'VIDEO',
          mimeType: 'video/mp4',
          fileSizeBytes: 100,
          contentSha256: null,
          durationSeconds: null,
        },
        config,
      ),
    );
    assert.doesNotThrow(() =>
      validator.validateDeclaration(
        {
          businessPurpose: 'EXERCISE_RECORD',
          mediaType: 'VIDEO',
          mimeType: 'video/quicktime',
          fileSizeBytes: 250_000_000,
          contentSha256: null,
          durationSeconds: 15,
        },
        config,
      ),
    );
    assert.throws(
      () =>
        validator.validateDeclaration(
          {
            businessPurpose: 'EXERCISE_RECORD',
            mediaType: 'VIDEO',
            mimeType: 'video/mp4',
            fileSizeBytes: config.maxVideoTransportBytes + 1,
            contentSha256: null,
            durationSeconds: 15,
          },
          config,
        ),
      (error: unknown) => error instanceof ApplicationError && error.code === 'MEDIA_SIZE_EXCEEDED',
    );
    assert.doesNotThrow(() =>
      validator.validateDeclaration(
        {
          businessPurpose: 'EXERCISE_RECORD',
          mediaType: 'VIDEO',
          mimeType: 'video/webm',
          fileSizeBytes: 100,
          contentSha256: null,
          durationSeconds: 15,
        },
        config,
      ),
    );
    assert.throws(
      () =>
        validator.validateDeclaration(
          {
            businessPurpose: 'EXERCISE_RECORD',
            mediaType: 'VIDEO',
            mimeType: 'video/mp4',
            fileSizeBytes: 1,
            contentSha256: null,
            durationSeconds: 16,
          },
          config,
        ),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'MEDIA_VIDEO_DURATION_EXCEEDED',
    );
  });

  it('streams video verification and enforces the trusted duration at the exact boundary', async () => {
    const validator = new MediaValidator();
    const accepted = mp4(15_000);
    const verified = await validator.readAndVerify(
      Readable.from([accepted.subarray(0, 37), accepted.subarray(37)]),
      {
        businessPurpose: 'EXERCISE_RECORD',
        mediaType: 'VIDEO',
        mimeType: 'video/mp4',
        fileSizeBytes: accepted.length,
        contentSha256: createHash('sha256').update(accepted).digest('hex'),
        durationSeconds: 15,
      },
      config,
    );
    assert.equal(verified.durationSeconds, 15);
    assert.deepEqual(verified.safeMetadata, {
      durationSeconds: 15,
      audioTrackCount: 1,
      videoTrackCount: 1,
    });

    const rejected = mp4(15_001);
    await assert.rejects(
      validator.readAndVerify(
        Readable.from(rejected),
        {
          businessPurpose: 'EXERCISE_RECORD',
          mediaType: 'VIDEO',
          mimeType: 'video/mp4',
          fileSizeBytes: rejected.length,
          contentSha256: null,
          durationSeconds: 16,
        },
        config,
      ),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'MEDIA_VIDEO_DURATION_EXCEEDED',
    );
  });

  it('accepts a 15-second audible WebM and verifies its actual tracks and duration', async () => {
    const validator = new MediaValidator();
    const accepted = webm(15);
    const verified = await validator.readAndVerify(
      Readable.from([accepted.subarray(0, 11), accepted.subarray(11, 47), accepted.subarray(47)]),
      {
        businessPurpose: 'EXERCISE_RECORD',
        mediaType: 'VIDEO',
        mimeType: 'video/webm',
        fileSizeBytes: accepted.length,
        contentSha256: createHash('sha256').update(accepted).digest('hex'),
        durationSeconds: 15,
      },
      config,
    );
    assert.equal(verified.mimeType, 'video/webm');
    assert.equal(verified.durationSeconds, 15);
    assert.deepEqual(verified.safeMetadata, {
      durationSeconds: 15,
      audioTrackCount: 1,
      videoTrackCount: 1,
    });
  });

  it('rejects WebM duration overflow, missing audio, and location tags', async () => {
    const validator = new MediaValidator();
    for (const [body, durationSeconds, code] of [
      [webm(15.001), 16, 'MEDIA_VIDEO_DURATION_EXCEEDED'],
      [webm(8, { hasAudio: false }), 8, 'MEDIA_AUDIO_TRACK_REQUIRED'],
      [webm(8, { hasLocationMetadata: true }), 8, 'MEDIA_LOCATION_METADATA_NOT_ALLOWED'],
    ] as const) {
      await assert.rejects(
        validator.readAndVerify(
          Readable.from(body),
          {
            businessPurpose: 'EXERCISE_RECORD',
            mediaType: 'VIDEO',
            mimeType: 'video/webm',
            fileSizeBytes: body.length,
            contentSha256: null,
            durationSeconds,
          },
          config,
        ),
        (error: unknown) => error instanceof ApplicationError && error.code === code,
      );
    }
  });

  it('rejects an exercise video without a trusted audio track', async () => {
    const validator = new MediaValidator();
    const silent = mp4(8_000, { hasAudio: false, spoofAudioInMediaData: true });
    await assert.rejects(
      validator.readAndVerify(
        Readable.from([silent.subarray(0, 73), silent.subarray(73)]),
        {
          businessPurpose: 'EXERCISE_RECORD',
          mediaType: 'VIDEO',
          mimeType: 'video/mp4',
          fileSizeBytes: silent.length,
          contentSha256: createHash('sha256').update(silent).digest('hex'),
          durationSeconds: 8,
        },
        config,
      ),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'MEDIA_AUDIO_TRACK_REQUIRED',
    );

    const nonExercise = await validator.readAndVerify(
      Readable.from(silent),
      {
        businessPurpose: 'EXEMPTION_APPLICATION',
        mediaType: 'VIDEO',
        mimeType: 'video/mp4',
        fileSizeBytes: silent.length,
        contentSha256: null,
        durationSeconds: 8,
      },
      config,
    );
    assert.deepEqual(nonExercise.safeMetadata, {
      durationSeconds: 8,
      audioTrackCount: 0,
      videoTrackCount: 1,
    });
  });

  it('rejects an audio-only ISO media container even when it has a trusted audio handler', async () => {
    const body = mp4(8_000);
    const audioOnly = Buffer.from(body);
    audioOnly.write('soun', audioOnly.indexOf(Buffer.from('vide', 'ascii')), 'ascii');
    await assert.rejects(
      new MediaValidator().readAndVerify(
        Readable.from(audioOnly),
        {
          businessPurpose: 'EXERCISE_RECORD',
          mediaType: 'VIDEO',
          mimeType: 'video/mp4',
          fileSizeBytes: audioOnly.length,
          contentSha256: null,
          durationSeconds: 8,
        },
        config,
      ),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'MEDIA_INTEGRITY_MISMATCH',
    );
  });

  it('rejects ISO location metadata without scanning random media payload bytes', async () => {
    const located = mp4(8_000, { hasLocationMetadata: true });
    await assert.rejects(
      new MediaValidator().readAndVerify(
        Readable.from(located),
        {
          businessPurpose: 'EXERCISE_RECORD',
          mediaType: 'VIDEO',
          mimeType: 'video/mp4',
          fileSizeBytes: located.length,
          contentSha256: null,
          durationSeconds: 8,
        },
        config,
      ),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'MEDIA_LOCATION_METADATA_NOT_ALLOWED',
    );

    const payloadText = mp4(8_000, { locationTextInMediaData: true });
    const verified = await new MediaValidator().readAndVerify(
      Readable.from(payloadText),
      {
        businessPurpose: 'EXERCISE_RECORD',
        mediaType: 'VIDEO',
        mimeType: 'video/mp4',
        fileSizeBytes: payloadText.length,
        contentSha256: null,
        durationSeconds: 8,
      },
      config,
    );
    assert.equal(verified.durationSeconds, 8);
  });
});
