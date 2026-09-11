import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import { TencentOcrProvider, ocrConfiguration } from '../../backend/src/modules/v8/tencent-ocr-provider.ts';
import { syntheticPng } from './synthetic-png.mjs';
const bytes = syntheticPng(), digest = createHash('sha256').update(bytes).digest('hex');
const configured = ocrConfiguration({ OCR_PROVIDER: 'TENCENT_TABLE_V3', OCR_TENCENT_REGION: 'ap-guangzhou' });
const response = { RequestId: 'synthetic-request', TableDetections: [{ Cells: [{ Text: '000123', RowTl: 1, RowBr: 2,
  ColTl: 0, ColBr: 1, Confidence: 90, Polygon: [{ X: 0, Y: 0 }, { X: 10, Y: 0 }, { X: 10, Y: 10 }, { X: 0, Y: 10 }] }] }] };
test('OCR defaults disabled and validates explicit region/timeout without requiring credentials at startup', async () => {
  assert.deepEqual(ocrConfiguration({}), { provider: 'DISABLED' });
  for (const raw of [{ OCR_PROVIDER: 'FAKE' }, { OCR_PROVIDER: 'TENCENT_TABLE_V3' },
    { OCR_PROVIDER: 'TENCENT_TABLE_V3', OCR_TENCENT_REGION: 'https://arbitrary.example' },
    { OCR_PROVIDER: 'TENCENT_TABLE_V3', OCR_TENCENT_REGION: 'ap-guangzhou', OCR_TIMEOUT_MS: 999 }])
    assert.throws(() => ocrConfiguration(raw));
  await assert.rejects(new TencentOcrProvider({ provider: 'DISABLED' }).recognize(bytes, 'image/png', digest), /NOT_CONFIGURED/);
});
test('provider sends exact private bytes, validates source binding, and retains unconfirmed recognized evidence', async () => {
  const calls = [];
  const provider = new TencentOcrProvider(configured, { async request(action, body, options) {
    calls.push({ action, body }); assert.ok(options.signal instanceof AbortSignal); return response;
  } });
  const recognized = await provider.recognize(bytes, 'image/png', digest);
  assert.deepEqual(calls, [{ action: 'RecognizeTableAccurateOCR', body: { ImageBase64: bytes.toString('base64') } }]);
  assert.equal(recognized.sourceSha256, digest); assert.equal(recognized.requiresTeacherConfirmation, true);
  assert.equal(recognized.tables[0].cells[0].text, '000123');
  await assert.rejects(provider.recognize(bytes, 'image/png', 'a'.repeat(64)), /DIGEST_MISMATCH/);
  await assert.rejects(provider.recognize(bytes, 'image/gif', digest), /FORMAT_UNSUPPORTED/);
  assert.equal(calls.length, 1);
});
test('provider errors are sanitized and failed responses do not become recognized evidence', async () => {
  for (const [error, expected] of [[Object.assign(new Error('synthetic private upstream detail'), { code: 'ETIMEDOUT' }), 'OCR_PROVIDER_TIMEOUT'],
    [new Error('synthetic private upstream detail'), 'OCR_PROVIDER_UNAVAILABLE']]) {
    const provider = new TencentOcrProvider(configured, { async request() { throw error; } });
    await assert.rejects(provider.recognize(bytes, 'image/png', digest), failure => failure.message === expected);
  }
  const empty = new TencentOcrProvider(configured, { async request() { return { RequestId: 'synthetic', TableDetections: [] }; } });
  await assert.rejects(empty.recognize(bytes, 'image/png', digest), /NO_TABLE_DETECTED/);
});

test('cloud authentication, throttling and quota failures retain safe actionable categories', async () => {
  for (const [code, expected] of [
    ['AuthFailure.UnauthorizedOperation','OCR_PROVIDER_PERMISSION_DENIED'],
    ['AuthFailure.TokenFailure','OCR_PROVIDER_PERMISSION_DENIED'],
    ['UnauthorizedOperation','OCR_PROVIDER_PERMISSION_DENIED'],
    ['RequestLimitExceeded','OCR_PROVIDER_RATE_LIMITED'],
    ['RequestLimitExceeded.UinLimitExceeded','OCR_PROVIDER_RATE_LIMITED'],
    ['LimitExceeded','OCR_PROVIDER_QUOTA_EXCEEDED'],
    ['ResourceInsufficient','OCR_PROVIDER_QUOTA_EXCEEDED'],
    ['InternalError','OCR_PROVIDER_UNAVAILABLE'],
  ]) {
    const provider = new TencentOcrProvider(configured, { async request() {
      throw Object.assign(new Error('private provider message must not escape'), { code });
    } });
    await assert.rejects(provider.recognize(bytes,'image/png',digest), error => error.message === expected);
  }
});
import { createRequire } from 'node:module';
const sharp = createRequire(new URL('../../backend/package.json', import.meta.url))('sharp');
test('WebP is losslessly prepared for OCR while evidence stays bound to the original source', async () => {
  const webp = await sharp({create:{width:40,height:30,channels:3,background:'#1a82c3'}}).webp({lossless:true}).toBuffer();
  const original = Buffer.from(webp), sha = createHash('sha256').update(webp).digest('hex');
  let sent;
  const provider = new TencentOcrProvider(configured,{async request(_action,body){sent=Buffer.from(body.ImageBase64,'base64');return response;}});
  const evidence = await provider.recognize(webp,'image/webp',sha);
  assert.equal((await sharp(sent).metadata()).format,'png');
  assert.deepEqual(await sharp(sent).raw().toBuffer(),await sharp(webp).raw().toBuffer());
  assert.deepEqual(webp,original);assert.equal(evidence.sourceSha256,sha);
});
test('oversized source uses lossless preparation without resizing and malformed data never reaches provider', async () => {
  const png=await sharp({create:{width:48,height:36,channels:3,background:'#f8f8f8'}}).png().toBuffer();
  const source=Buffer.concat([png,Buffer.alloc(7600000)]);let count=0;
  const provider=new TencentOcrProvider(configured,{async request(_action,body){count++;assert.ok(body.ImageBase64.length<=10000000);const sent=Buffer.from(body.ImageBase64,'base64');assert.deepEqual(await sharp(sent).raw().toBuffer(),await sharp(png).raw().toBuffer());return response;}});
  await provider.recognize(source,'image/png',createHash('sha256').update(source).digest('hex'));assert.equal(count,1);
  const invalid=Buffer.alloc(7600000);await assert.rejects(provider.recognize(invalid,'image/png',createHash('sha256').update(invalid).digest('hex')),/IMAGE_INVALID/);assert.equal(count,1);
});

test('uncompressible page remains a clear size failure without upstream call or lossy resize', async () => {
  const noise=await sharp(randomBytes(1600*1600*3),{raw:{width:1600,height:1600,channels:3}}).png({compressionLevel:0}).toBuffer();
  assert.ok(noise.length>7500000);let calls=0;
  const provider=new TencentOcrProvider(configured,{async request(){calls++;return response;}});
  await assert.rejects(provider.recognize(noise,'image/png',createHash('sha256').update(noise).digest('hex')),/IMAGE_SIZE_LIMIT/);assert.equal(calls,0);
});
