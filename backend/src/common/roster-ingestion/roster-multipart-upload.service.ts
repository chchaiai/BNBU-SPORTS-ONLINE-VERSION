import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { PassThrough, Transform, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { TextDecoder } from 'node:util';

import { Inject, Injectable } from '@nestjs/common';
import busboy from 'busboy';

import type { RuntimeConfig } from '../config/environment.js';
import { RUNTIME_CONFIG } from '../config/runtime-config.module.js';
import { ApplicationError } from '../errors/application-error.js';
import {
  OBJECT_STORAGE_PORT,
  type ObjectStoragePort,
} from '../object-storage/object-storage.port.js';
import {
  ROSTER_CANONICAL_FIELDS,
  type ReceivedRosterUpload,
  type RosterFieldMappingSnapshot,
} from './roster-ingestion.types.js';

const MAX_MULTIPART_METADATA_BYTES = 64 * 1024;
export const MAX_ROSTER_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_FIELD_BYTES = 4 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const HEADER_PATTERN = /^[^\u0000-\u001f\u007f]{1,128}$/u;
const SAFE_FILE_NAME_PATTERN = /^[^.\/\\:\u0000-\u001f\u007f][^\/\\:\u0000-\u001f\u007f]*\.csv$/iu;
const ALLOWED_TRANSFER_ENCODINGS = new Set(['7bit', '8bit', 'binary']);

interface MultipartFieldState {
  sheetName?: string;
  source?: string;
  fileFormat?: string;
  fileChecksumSha256?: string;
  fieldMappingSnapshot?: string;
}

interface StoredFile {
  fileFormat: 'CSV' | 'XLSX';
  storageKey: string;
  sanitizedOriginalFileName: string;
  checksumSha256: string;
  sizeBytes: number;
}

class BodyLimitTransform extends Transform {
  private bytes = 0;

  constructor(private readonly maximumBytes: number) {
    super();
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.bytes += chunk.length;
    if (this.bytes > this.maximumBytes) {
      callback(
        new ApplicationError('ROSTER_FILE_INVALID', 422, {
          category: 'MULTIPART_BODY_LIMIT',
        }),
      );
      return;
    }
    callback(null, chunk);
  }
}

class CsvSafetyTransform extends Transform {
  constructor(private readonly format: 'CSV' | 'XLSX' = 'CSV') { super(); }
  private readonly checksum = createHash('sha256');
  private readonly decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  private readonly prefixChunks: Buffer[] = [];
  private prefixLength = 0;
  private decodedCharacters = 0;
  private bytes = 0;

  get sizeBytes(): number {
    return this.bytes;
  }

  digest(): string {
    return this.checksum.digest('hex');
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    try {
      this.bytes += chunk.length;
      this.checksum.update(chunk);
      if (this.format === 'CSV' && chunk.includes(0)) this.invalid('NUL_BYTE');
      if (this.prefixLength < 16) {
        const prefixPart = chunk.subarray(0, Math.min(chunk.length, 16 - this.prefixLength));
        this.prefixChunks.push(prefixPart);
        this.prefixLength += prefixPart.length;
      }
      if (this.format === 'CSV') this.validateDecodedText(this.decoder.decode(chunk, { stream: true }));
      callback(null, chunk);
    } catch (error) {
      callback(this.normalizeError(error));
    }
  }

  override _flush(callback: TransformCallback): void {
    try {
      if (this.bytes === 0) this.invalid('EMPTY_FILE');
      if (this.format === 'CSV') {
        this.validateDecodedText(this.decoder.decode());
        this.validateSignature(Buffer.concat(this.prefixChunks));
      } else if (!Buffer.concat(this.prefixChunks).subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 3, 4]))) {
        this.invalid('XLSX_SIGNATURE');
      }
      callback();
    } catch (error) {
      callback(this.normalizeError(error));
    }
  }

  private validateDecodedText(value: string): void {
    for (const character of value) {
      if (character === '\uFEFF' && this.decodedCharacters !== 0) this.invalid('UNEXPECTED_BOM');
      this.decodedCharacters += 1;
    }
  }

  private validateSignature(prefix: Buffer): void {
    const contentPrefix = prefix.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))
      ? prefix.subarray(3)
      : prefix;
    const signatures = [
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0]),
      Buffer.from('%PDF-', 'ascii'),
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      Buffer.from([0xff, 0xd8, 0xff]),
    ];
    if (
      signatures.some((signature) => contentPrefix.subarray(0, signature.length).equals(signature))
    ) {
      this.invalid('BINARY_SIGNATURE');
    }
  }

  private invalid(category: string): never {
    throw new ApplicationError('ROSTER_FILE_INVALID', 422, { category });
  }

  private normalizeError(error: unknown): Error {
    if (error instanceof ApplicationError) return error;
    return new ApplicationError('ROSTER_FILE_INVALID', 422, {
      category: 'UTF8_DECODING',
    });
  }
}

@Injectable()
export class RosterMultipartUploadService {
  constructor(
    @Inject(RUNTIME_CONFIG) _config: RuntimeConfig,
    @Inject(OBJECT_STORAGE_PORT) private readonly objectStorage: ObjectStoragePort,
  ) {}

  async receive(
    request: IncomingMessage,
    scope: { organizationId: string; classSectionId: string },
  ): Promise<ReceivedRosterUpload> {
    const fields: MultipartFieldState = {};
    let fieldError: ApplicationError | null = null;
    let fileCount = 0;
    let generatedStorageKey: string | null = null;
    let fileTask: Promise<StoredFile> | null = null;

    const parser = this.createParser(request);
    parser.on('field', (name, value, info) => {
      if (fieldError !== null) return;
      if (info.nameTruncated || info.valueTruncated) {
        fieldError = this.schemaError('MULTIPART_FIELD_LIMIT');
        return;
      }
      if (!this.assignField(fields, name, value)) {
        fieldError = this.schemaError('MULTIPART_FIELD_UNKNOWN_OR_DUPLICATED');
      }
    });
    parser.on('file', (name, stream, info) => {
      fileCount += 1;
      if (name !== 'file' || fileCount !== 1) {
        stream.resume();
        fieldError ??= this.schemaError('MULTIPART_FILE_PART_INVALID');
        return;
      }
      try {
        const fileFormat = info.filename.toLowerCase().endsWith('.xlsx') ? 'XLSX' : 'CSV';
        const sanitizedOriginalFileName = fileFormat === 'CSV' ? this.sanitizeCsvFileName(info.filename)
          : this.sanitizeCsvFileName(info.filename.slice(0, -5) + '.csv').slice(0, -4) + '.xlsx';
        if (
          info.mimeType.toLowerCase() !== (fileFormat === 'CSV' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') ||
          !ALLOWED_TRANSFER_ENCODINGS.has(info.encoding.toLowerCase())
        ) {
          throw new ApplicationError('ROSTER_FILE_INVALID', 422, {
            category: 'FILE_TYPE',
          });
        }
        generatedStorageKey = this.createStorageKey(scope).replace(/\.csv$/, fileFormat === 'CSV' ? '.csv' : '.xlsx');
        fileTask = this.storeFile(
          stream,
          generatedStorageKey,
          sanitizedOriginalFileName,
          MAX_ROSTER_UPLOAD_BYTES,
          fileFormat,
        );
        void fileTask.catch(() => undefined);
      } catch (error) {
        stream.resume();
        fieldError = this.normalizeMultipartError(error);
      }
    });
    parser.on('fieldsLimit', () => {
      fieldError ??= this.schemaError('MULTIPART_FIELD_LIMIT');
    });
    parser.on('filesLimit', () => {
      fieldError ??= this.schemaError('MULTIPART_FILE_LIMIT');
    });
    parser.on('partsLimit', () => {
      fieldError ??= this.schemaError('MULTIPART_PART_LIMIT');
    });

    try {
      await pipeline(
        request,
        new BodyLimitTransform(MAX_ROSTER_UPLOAD_BYTES + MAX_MULTIPART_METADATA_BYTES),
        parser,
      );
      if (fields.source === 'OFFICIAL_API') {
        throw new ApplicationError('ROSTER_IMPORT_SOURCE_UNSUPPORTED', 409, {
          source: 'OFFICIAL_API',
        });
      }
      const multipartFieldError = fieldError as ApplicationError | null;
      if (multipartFieldError !== null) throw multipartFieldError;

      const source = fields.source;
      if (source !== 'FILE') throw this.schemaError('SOURCE');
      if (!['CSV', 'XLSX'].includes(fields.fileFormat ?? '')) {
        throw new ApplicationError('ROSTER_FILE_INVALID', 422, {
          category: 'FILE_FORMAT',
        });
      }
      const activeFileTask = fileTask as Promise<StoredFile> | null;
      if (activeFileTask === null || fileCount !== 1) throw this.schemaError('FILE_REQUIRED');

      const storedFile = await activeFileTask;
      if (fields.fileFormat !== storedFile.fileFormat) throw this.schemaError('FILE_FORMAT_MISMATCH');
      const sourceSheet = fields.sheetName ?? null;
      if (storedFile.fileFormat === 'XLSX' ? (!sourceSheet || sourceSheet !== sourceSheet.trim() || sourceSheet.length > 31)
        : sourceSheet !== null) throw this.schemaError('SOURCE_SHEET');
      const fieldMappingSnapshot = this.parseFieldMapping(fields.fieldMappingSnapshot);
      const declaredChecksum = fields.fileChecksumSha256?.trim() ?? '';
      if (declaredChecksum.length > 0 && !SHA256_PATTERN.test(declaredChecksum)) {
        throw this.schemaError('CHECKSUM_FORMAT');
      }
      if (declaredChecksum.length > 0 && declaredChecksum !== storedFile.checksumSha256) {
        throw new ApplicationError('ROSTER_FILE_INVALID', 422, {
          category: 'CHECKSUM_MISMATCH',
        });
      }

      return {
        source: 'FILE',
        fileFormat: storedFile.fileFormat,
        sourceSheet,
        sanitizedOriginalFileName: storedFile.sanitizedOriginalFileName,
        sourceFileStorageKey: storedFile.storageKey,
        fileChecksumSha256: storedFile.checksumSha256,
        fileSizeBytes: storedFile.sizeBytes,
        fieldMappingSnapshot,
      };
    } catch (error) {
      const cleanupFileTask = fileTask as Promise<StoredFile> | null;
      if (cleanupFileTask !== null) await cleanupFileTask.catch(() => undefined);
      if (generatedStorageKey !== null) {
        await this.objectStorage.deletePrivateObject(generatedStorageKey).catch(() => undefined);
      }
      throw this.normalizeMultipartError(error);
    }
  }

  private createParser(request: IncomingMessage): ReturnType<typeof busboy> {
    try {
      return busboy({
        headers: request.headers,
        defCharset: 'utf8',
        defParamCharset: 'utf8',
        preservePath: true,
        limits: {
          fieldNameSize: 64,
          fieldSize: MAX_FIELD_BYTES,
          fields: 5,
          // Busboy marks a file truncated when it reaches the configured size.
          // Reserve one byte so the documented inclusive limit is accepted.
          fileSize: MAX_ROSTER_UPLOAD_BYTES + 1,
          files: 1,
          // Busboy emits partsLimit when the configured count is reached, so one sentinel slot
          // is required while fields/files enforce the actual five-plus-one contract.
          parts: 7,
          headerPairs: 50,
        },
      });
    } catch {
      throw new ApplicationError('ROSTER_FILE_INVALID', 422, {
        category: 'MULTIPART_CONTENT_TYPE',
      });
    }
  }

  private async storeFile(
    stream: NodeJS.ReadableStream & { truncated?: boolean },
    storageKey: string,
    sanitizedOriginalFileName: string,
    maximumBytes: number,
    fileFormat: 'CSV' | 'XLSX',
  ): Promise<StoredFile> {
    const safety = new CsvSafetyTransform(fileFormat);
    const body = new PassThrough();
    const validationTask = pipeline(stream, safety, body);
    const storageTask = this.objectStorage.putPrivateObject({
      storageKey,
      body,
      contentType: fileFormat === 'CSV' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const [validation, storage] = await Promise.allSettled([validationTask, storageTask]);
    if (validation.status === 'rejected') throw validation.reason;
    if (storage.status === 'rejected') throw storage.reason;
    if (stream.truncated === true || safety.sizeBytes > maximumBytes) {
      throw new ApplicationError('ROSTER_FILE_INVALID', 422, {
        category: 'FILE_SIZE_LIMIT',
      });
    }
    return {
      fileFormat,
      storageKey,
      sanitizedOriginalFileName,
      checksumSha256: safety.digest(),
      sizeBytes: safety.sizeBytes,
    };
  }

  private sanitizeCsvFileName(value: string): string {
    const normalized = value.trim().normalize('NFC');
    if (
      normalized.length < 5 ||
      normalized.length > 255 ||
      !SAFE_FILE_NAME_PATTERN.test(normalized) ||
      normalized.slice(0, -4).includes('.')
    ) {
      throw new ApplicationError('ROSTER_FILE_INVALID', 422, {
        category: 'FILE_NAME',
      });
    }
    return `${normalized.slice(0, -4)}.csv`;
  }

  private createStorageKey(scope: { organizationId: string; classSectionId: string }): string {
    const namespace = createHash('sha256')
      .update(`${scope.organizationId}\u0000${scope.classSectionId}`, 'utf8')
      .digest('hex')
      .slice(0, 32);
    return `roster-sources/${namespace}/${randomUUID()}.csv`;
  }

  private assignField(fields: MultipartFieldState, name: string, value: string): boolean {
    if (name === 'sheetName' && fields.sheetName === undefined) fields.sheetName = value;
    else if (name === 'source' && fields.source === undefined) fields.source = value;
    else if (name === 'fileFormat' && fields.fileFormat === undefined) fields.fileFormat = value;
    else if (name === 'fileChecksumSha256' && fields.fileChecksumSha256 === undefined)
      fields.fileChecksumSha256 = value;
    else if (name === 'fieldMappingSnapshot' && fields.fieldMappingSnapshot === undefined)
      fields.fieldMappingSnapshot = value;
    else return false;
    return true;
  }

  private parseFieldMapping(value: string | undefined): RosterFieldMappingSnapshot {
    if (value === undefined) throw this.schemaError('FIELD_MAPPING_REQUIRED');
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw this.schemaError('FIELD_MAPPING_JSON');
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw this.schemaError('FIELD_MAPPING_SHAPE');
    }
    const record = parsed as Record<string, unknown>;
    if (Object.keys(record).some((key) => !ROSTER_CANONICAL_FIELDS.includes(key as never))) {
      throw this.schemaError('FIELD_MAPPING_UNKNOWN_FIELD');
    }
    const requiredKeys = new Set(['studentNumber', 'fullName']);
    const headers = new Set<string>();
    const output: Record<string, string | null> = {};
    for (const key of ROSTER_CANONICAL_FIELDS) {
      const rawHeader = record[key];
      if (rawHeader === undefined || rawHeader === null || rawHeader === '') {
        if (requiredKeys.has(key)) throw this.schemaError('FIELD_MAPPING_REQUIRED_FIELD');
        output[key] = null;
        continue;
      }
      if (typeof rawHeader !== 'string') throw this.schemaError('FIELD_MAPPING_VALUE');
      const header = rawHeader.trim().normalize('NFC');
      if (!HEADER_PATTERN.test(header) || headers.has(header)) {
        throw this.schemaError('FIELD_MAPPING_HEADER');
      }
      headers.add(header);
      output[key] = header;
    }
    return output as unknown as RosterFieldMappingSnapshot;
  }

  private schemaError(category: string): ApplicationError {
    return new ApplicationError('ROSTER_SCHEMA_INVALID', 422, { category });
  }

  private normalizeMultipartError(error: unknown): ApplicationError {
    if (error instanceof ApplicationError) return error;
    return new ApplicationError('ROSTER_FILE_INVALID', 422, {
      category: 'MULTIPART_STREAM',
    });
  }
}
