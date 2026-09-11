import { Inject, Injectable } from '@nestjs/common';
import { parse } from 'csv-parse';
import { createHash } from 'node:crypto';
import { readRosterXlsxIsolated } from '../../modules/v8/domain/roster-xlsx-isolated.js';

import { ApplicationError } from '../errors/application-error.js';
import {
  OBJECT_STORAGE_PORT,
  type ObjectStoragePort,
} from '../object-storage/object-storage.port.js';
import {
  ROSTER_CANONICAL_FIELDS,
  type ParsedRosterCsv,
  type ParsedRosterRow,
  type RosterCanonicalField,
  type RosterFieldMappingSnapshot,
} from './roster-ingestion.types.js';

const MAX_ROSTER_ROWS = 500;
const MAX_CSV_COLUMNS = 32;
const MAX_CSV_RECORD_BYTES = 16 * 1024;
const STUDENT_NUMBER_PATTERN = /^[A-Z0-9._-]{1,32}$/;
const FORMULA_PREFIX_PATTERN = /^[=+\-@]/;
const HEADER_PATTERN = /^[^\u0000-\u001f\u007f]{1,128}$/u;
const GENDERS = new Set(['MALE', 'FEMALE', 'OTHER']);

type SafeSnapshot = Record<RosterCanonicalField, string | null>;

@Injectable()
export class RosterCsvParserService {
  constructor(@Inject(OBJECT_STORAGE_PORT) private readonly objectStorage: ObjectStoragePort) {}

  async parseStoredXlsx(input: { sourceFileStorageKey: string; expectedSha256: string; sheetName: string;
    fieldMappingSnapshot: RosterFieldMappingSnapshot }): Promise<ParsedRosterCsv> {
    if (!/^[a-f0-9]{64}$/.test(input.expectedSha256)) throw this.schemaError('SOURCE_DIGEST_REQUIRED');
    if (!input.fieldMappingSnapshot.fullName) throw this.schemaError('FULL_NAME_MAPPING_REQUIRED');
    const source = await this.objectStorage.getPrivateObject(input.sourceFileStorageKey);
    const chunks: Buffer[] = [];
    const digest = createHash('sha256');
    let size = 0;
    for await (const chunk of source) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      size += bytes.length;
      if (size > 100 * 1024 * 1024) throw this.schemaError('FILE_SIZE_LIMIT');
      digest.update(bytes);
      chunks.push(bytes);
    }
    if (digest.digest('hex') !== input.expectedSha256) throw this.schemaError('SOURCE_DIGEST_MISMATCH');
    const table = await readRosterXlsxIsolated(Buffer.concat(chunks), input.sheetName, {
      studentNumber: input.fieldMappingSnapshot.studentNumber, fullName: input.fieldMappingSnapshot.fullName,
    });
    const headers = this.validateHeaders(table.headers, input.fieldMappingSnapshot, true);
    const indexes = this.mappingIndexes(headers, input.fieldMappingSnapshot);
    const rows = table.rows.map(row => this.parseRow(row.cells, indexes, row.sourceRowNumber, headers.length));
    this.markDuplicates(rows);
    return { rows, totalRowCount: rows.length,
      validRowCount: rows.filter(row => row.rowValidationStatus === 'VALID').length,
      invalidRowCount: rows.filter(row => row.rowValidationStatus === 'INVALID').length,
      duplicatedRowCount: rows.filter(row => row.rowValidationStatus === 'DUPLICATED').length };
  }

  async parseStoredCsv(input: {
    sourceFileStorageKey: string;
    fieldMappingSnapshot: RosterFieldMappingSnapshot;
  }): Promise<ParsedRosterCsv> {
    const source = await this.objectStorage.getPrivateObject(input.sourceFileStorageKey);
    const parser = parse({
      bom: true,
      columns: false,
      delimiter: ',',
      encoding: 'utf8',
      max_record_size: MAX_CSV_RECORD_BYTES,
      relax_column_count: true,
      relax_quotes: false,
      skip_empty_lines: false,
      trim: false,
    });
    source.once('error', (error) => parser.destroy(error));
    source.pipe(parser);

    const rows: ParsedRosterRow[] = [];
    let headers: string[] | null = null;
    let indexes: Readonly<Record<RosterCanonicalField, number | null>> | null = null;
    try {
      for await (const recordValue of parser as AsyncIterable<unknown>) {
        const record = this.stringRecord(recordValue);
        if (headers === null) {
          headers = this.validateHeaders(record, input.fieldMappingSnapshot);
          indexes = this.mappingIndexes(headers, input.fieldMappingSnapshot);
          continue;
        }
        if (rows.length >= MAX_ROSTER_ROWS) throw this.schemaError('ROW_LIMIT');
        if (indexes === null) throw this.schemaError('HEADER_REQUIRED');
        rows.push(this.parseRow(record, indexes, rows.length + 2, headers.length));
      }
    } catch (error) {
      source.destroy();
      if (error instanceof ApplicationError) throw error;
      throw this.schemaError('CSV_PARSE');
    }
    if (headers === null) throw this.schemaError('HEADER_REQUIRED');

    this.markDuplicates(rows);
    const validRowCount = rows.filter((row) => row.rowValidationStatus === 'VALID').length;
    const invalidRowCount = rows.filter((row) => row.rowValidationStatus === 'INVALID').length;
    const duplicatedRowCount = rows.filter(
      (row) => row.rowValidationStatus === 'DUPLICATED',
    ).length;
    return {
      rows,
      totalRowCount: rows.length,
      validRowCount,
      invalidRowCount,
      duplicatedRowCount,
    };
  }

  private validateHeaders(record: string[], mapping: RosterFieldMappingSnapshot, allowUnmapped = false): string[] {
    const headers = record.map((header) => header.trim().normalize('NFC'));
    if (
      headers.length === 0 ||
      headers.length > MAX_CSV_COLUMNS ||
      headers.some((header) => !HEADER_PATTERN.test(header)) ||
      new Set(headers).size !== headers.length
    ) {
      throw this.schemaError('HEADER_INVALID');
    }
    const mappedHeaders = ROSTER_CANONICAL_FIELDS.flatMap((field) => {
      const header = mapping[field];
      return header === null ? [] : [header];
    });
    if (
      (!allowUnmapped && mappedHeaders.length !== headers.length) ||
      mappedHeaders.some((header) => !headers.includes(header))
    ) {
      throw this.schemaError('HEADER_MAPPING_MISMATCH');
    }
    return headers;
  }

  private mappingIndexes(
    headers: string[],
    mapping: RosterFieldMappingSnapshot,
  ): Readonly<Record<RosterCanonicalField, number | null>> {
    return Object.fromEntries(
      ROSTER_CANONICAL_FIELDS.map((field) => {
        const header = mapping[field];
        return [field, header === null ? null : headers.indexOf(header)];
      }),
    ) as unknown as Readonly<Record<RosterCanonicalField, number | null>>;
  }

  private parseRow(
    record: string[],
    indexes: Readonly<Record<RosterCanonicalField, number | null>>,
    sourceRowNumber: number,
    expectedColumnCount: number,
  ): ParsedRosterRow {
    const errors = new Set<string>();
    if (record.length !== expectedColumnCount) errors.add('COLUMN_COUNT_INVALID');
    const rawSnapshot = Object.fromEntries(
      ROSTER_CANONICAL_FIELDS.map((field) => {
        const index = indexes[field];
        return [field, index === null ? null : (record[index] ?? '')];
      }),
    );
    if (Buffer.byteLength(JSON.stringify(rawSnapshot), 'utf8') > 4 * 1024) {
      errors.add('ROW_SNAPSHOT_TOO_LARGE');
    }
    const snapshot = Object.fromEntries(
      ROSTER_CANONICAL_FIELDS.map((field) => {
        const index = indexes[field];
        const value = index === null ? null : (record[index] ?? '');
        const normalized = value === null ? null : this.safeRawValue(value, errors);
        return [field, normalized];
      }),
    ) as SafeSnapshot;

    const rawStudentNumber = this.value(record, indexes.studentNumber);
    const rawFullName = this.value(record, indexes.fullName);
    const normalizedStudentNumber = rawStudentNumber.trim().toUpperCase();
    const fullName = rawFullName.trim().normalize('NFC');
    const fullNameSafe = this.neutralizeFormula(fullName).slice(0, 100);
    if (this.formulaLike(rawStudentNumber)) errors.add('FORMULA_LIKE_VALUE');
    if (this.formulaLike(rawFullName)) errors.add('FORMULA_LIKE_VALUE');
    if (!STUDENT_NUMBER_PATTERN.test(normalizedStudentNumber)) errors.add('STUDENT_NUMBER_INVALID');
    if (fullName.length < 1 || fullName.length > 100) errors.add('FULL_NAME_INVALID');

    const genderText = this.optionalValue(record, indexes.gender);
    const gender = genderText?.trim().toUpperCase() ?? null;
    if (genderText !== null && this.formulaLike(genderText)) errors.add('FORMULA_LIKE_VALUE');
    if (gender !== null && !GENDERS.has(gender)) errors.add('GENDER_INVALID');

    const gradeYearText = this.optionalValue(record, indexes.gradeYear);
    const gradeYear =
      gradeYearText === null || gradeYearText.trim() === ''
        ? null
        : Number.parseInt(gradeYearText.trim(), 10);
    const gradeYearValid =
      gradeYear !== null &&
      Number.isSafeInteger(gradeYear) &&
      gradeYear >= 1000 &&
      gradeYear <= 9999;
    if (gradeYearText !== null && this.formulaLike(gradeYearText)) errors.add('FORMULA_LIKE_VALUE');
    if (
      gradeYearText !== null &&
      gradeYearText.trim() !== '' &&
      (!/^\d{4}$/.test(gradeYearText.trim()) || !gradeYearValid)
    ) {
      errors.add('GRADE_YEAR_INVALID');
    }

    const collegeName = this.boundedOptional(record, indexes.collegeName, 200, errors);
    const majorName = this.boundedOptional(record, indexes.majorName, 200, errors);
    const administrativeClassName = this.boundedOptional(
      record,
      indexes.administrativeClassName,
      200,
      errors,
    );
    const rowErrorCodes = [...errors].sort();
    return {
      sourceRowNumber,
      normalizedStudentNumber: STUDENT_NUMBER_PATTERN.test(normalizedStudentNumber)
        ? normalizedStudentNumber
        : null,
      rawStudentNumberSafe: this.neutralizeFormula(rawStudentNumber).slice(0, 64) || null,
      fullName: fullNameSafe.length === 0 ? null : fullNameSafe,
      gender: GENDERS.has(gender ?? '') ? (gender as 'MALE' | 'FEMALE' | 'OTHER') : null,
      gradeYear: gradeYearValid ? gradeYear : null,
      collegeName,
      majorName,
      administrativeClassName,
      rowValidationStatus: rowErrorCodes.length === 0 ? 'VALID' : 'INVALID',
      rowErrorCodes,
      rawRowSnapshotSafe: snapshot,
    };
  }

  private markDuplicates(rows: ParsedRosterRow[]): void {
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (row.normalizedStudentNumber !== null) {
        counts.set(row.normalizedStudentNumber, (counts.get(row.normalizedStudentNumber) ?? 0) + 1);
      }
    }
    for (const row of rows) {
      if (
        row.normalizedStudentNumber !== null &&
        (counts.get(row.normalizedStudentNumber) ?? 0) > 1
      ) {
        // A duplicate identity must not erase a separate malformed-row error.
        if (row.rowValidationStatus === 'VALID') row.rowValidationStatus = 'DUPLICATED';
        row.rowErrorCodes = [...new Set([...row.rowErrorCodes, 'DUPLICATE_STUDENT_NUMBER'])].sort();
      }
    }
  }

  private stringRecord(value: unknown): string[] {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
      throw this.schemaError('CSV_RECORD');
    }
    return value as string[];
  }

  private value(record: string[], index: number | null): string {
    if (index === null) return '';
    return record[index] ?? '';
  }

  private optionalValue(record: string[], index: number | null): string | null {
    return index === null ? null : (record[index] ?? '');
  }

  private boundedOptional(
    record: string[],
    index: number | null,
    maximumLength: number,
    errors: Set<string>,
  ): string | null {
    const raw = this.optionalValue(record, index);
    if (raw === null || raw.trim() === '') return null;
    if (this.formulaLike(raw)) errors.add('FORMULA_LIKE_VALUE');
    const normalized = this.neutralizeFormula(raw.trim().normalize('NFC'));
    if (normalized.length > maximumLength) errors.add('FIELD_TOO_LONG');
    return normalized.slice(0, maximumLength);
  }

  private safeRawValue(value: string, errors: Set<string>): string {
    const neutralized = this.neutralizeFormula(value);
    if (this.formulaLike(value)) errors.add('FORMULA_LIKE_VALUE');
    return [...neutralized].slice(0, 128).join('');
  }

  private neutralizeFormula(value: string): string {
    const trimmed = value.trim();
    return FORMULA_PREFIX_PATTERN.test(trimmed) ? `'${trimmed}` : value;
  }

  private formulaLike(value: string): boolean {
    return FORMULA_PREFIX_PATTERN.test(value.trim());
  }

  private schemaError(category: string): ApplicationError {
    return new ApplicationError('ROSTER_SCHEMA_INVALID', 422, { category });
  }
}
