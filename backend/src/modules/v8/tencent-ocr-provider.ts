import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { AbstractClient } from 'tencentcloud-sdk-nodejs-common/tencentcloud/common/abstract_client.js';
import CvmRoleCredentialModule from 'tencentcloud-sdk-nodejs-common/tencentcloud/common/cvm_role_credential.js';
import { decodeTencentTableSource } from './domain/ocr-table-source.js';

export type OcrConfiguration = { provider: 'DISABLED' } |
  { provider: 'TENCENT_TABLE_V3'; region: string; timeoutMs: number; workerEnabled?: boolean };
export function ocrConfiguration(raw: Record<string, unknown>): OcrConfiguration {
  const provider = raw.OCR_PROVIDER ?? 'DISABLED';
  if (provider === 'DISABLED') return { provider };
  if (provider !== 'TENCENT_TABLE_V3') throw new Error('OCR_PROVIDER must be DISABLED or TENCENT_TABLE_V3');
  const region = raw.OCR_TENCENT_REGION;
  if (typeof region !== 'string' || !/^[a-z]+-[a-z]+(?:-[0-9]+)?$/.test(region)) throw new Error('OCR_TENCENT_REGION is required');
  const timeoutMs = Number(raw.OCR_TIMEOUT_MS ?? 20000);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) throw new Error('OCR_TIMEOUT_MS must be 1000..60000');
  const worker = raw.OCR_WORKER_ENABLED ?? 'false';
  if (worker !== 'true' && worker !== 'false') throw new Error('OCR_WORKER_ENABLED must be true or false');
  return { provider, region, timeoutMs, workerEnabled: worker === 'true' };
}
export interface TencentOcrClientPort {
  request(action: string, request: { ImageBase64: string }, options: { signal: AbortSignal }): Promise<unknown>;
}
const MAX_BASE64_BYTES = 10000000;
/** Preserve source pixels and coordinates; never resize or crop textual evidence. */
async function prepareImage(bytes: Buffer, mimeType: string): Promise<Buffer> {
  if (!bytes.length || bytes.length > 104857600) throw new Error('OCR_PROVIDER_IMAGE_SIZE_LIMIT');
  if (mimeType !== 'image/webp' && Math.ceil(bytes.length / 3) * 4 <= MAX_BASE64_BYTES) return bytes;
  let prepared: Buffer;
  try {
    const input = sharp(bytes, { limitInputPixels: 40000000, failOn: 'warning' }).timeout({ seconds: 20 });
    const metadata = await input.metadata();
    if ((metadata.pages ?? 1) !== 1 || metadata.format !== ({ 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp' } as Record<string, string>)[mimeType])
      throw new Error('Invalid single-page image');
    prepared = await input.png({ compressionLevel: 9, palette: false }).toBuffer();
  } catch {
    throw new Error('OCR_PROVIDER_IMAGE_INVALID');
  }
  if (Math.ceil(prepared.length / 3) * 4 > MAX_BASE64_BYTES) throw new Error('OCR_PROVIDER_IMAGE_SIZE_LIMIT');
  return prepared;
}
/** Uses the CVM role credential provider; it does not share static object-storage secrets. */
export class TencentOcrProvider {
  private readonly client: TencentOcrClientPort | null;
  private readonly clientOverride: TencentOcrClientPort | undefined;
  constructor(private readonly config: OcrConfiguration, client?: TencentOcrClientPort) {
    this.clientOverride = client;
    const { default: CvmRoleCredential } = CvmRoleCredentialModule;
    this.client = config.provider === 'DISABLED' ? null : client ?? new AbstractClient('ocr.tencentcloudapi.com', '2018-11-19', {
      credential: new CvmRoleCredential(), region: config.region,
      profile: { signMethod: 'TC3-HMAC-SHA256', httpProfile: { endpoint: 'ocr.tencentcloudapi.com',
        protocol: 'https://', reqMethod: 'POST', reqTimeout: Math.ceil(config.timeoutMs / 1000) } },
    });
  }
  withConfiguration(config: OcrConfiguration) { return new TencentOcrProvider(config, this.clientOverride); }
  async recognize(bytes: Buffer, mimeType: string, sourceSha256: string) {
    if (this.config.provider === 'DISABLED' || !this.client) throw new Error('OCR_PROVIDER_NOT_CONFIGURED');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) throw new Error('OCR_PROVIDER_IMAGE_FORMAT_UNSUPPORTED');
    if (createHash('sha256').update(bytes).digest('hex') !== sourceSha256) throw new Error('OCR_SOURCE_DIGEST_MISMATCH');
    const prepared = await prepareImage(bytes, mimeType);
    let response: unknown;
    try {
      response = await this.client.request('RecognizeTableAccurateOCR', { ImageBase64: prepared.toString('base64') },
        { signal: AbortSignal.timeout(this.config.timeoutMs) });
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      const name = error instanceof Error ? error.name : '';
      if (/^(AuthFailure|UnauthorizedOperation)(\.|$)/.test(code))
        throw new Error('OCR_PROVIDER_PERMISSION_DENIED');
      if (/^RequestLimitExceeded(\.|$)/.test(code)) throw new Error('OCR_PROVIDER_RATE_LIMITED');
      if (/^(LimitExceeded|ResourceInsufficient)(\.|$)/.test(code)) throw new Error('OCR_PROVIDER_QUOTA_EXCEEDED');
      throw new Error(code === 'ETIMEDOUT' || name === 'AbortError' || name === 'TimeoutError'
        ? 'OCR_PROVIDER_TIMEOUT' : 'OCR_PROVIDER_UNAVAILABLE');
    }
    return decodeTencentTableSource(response, sourceSha256);
  }
}
