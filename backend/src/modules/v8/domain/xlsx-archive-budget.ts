import { crc32, inflateRawSync } from 'node:zlib';

/** Validate ZIP metadata and bound each actual output before spreadsheet interpretation. */
export function inspectXlsxArchiveBudget(bytes: Uint8Array,
  limits = { maxEntries: 1024, maxExpandedBytes: 256 * 1024 * 1024 }) {
  if (!Number.isSafeInteger(limits.maxEntries) || limits.maxEntries < 1 ||
    !Number.isSafeInteger(limits.maxExpandedBytes) || limits.maxExpandedBytes < 1)
    throw new Error('XLSX_ARCHIVE_LIMITS_INVALID');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (offset: number) => view.getUint16(offset, true);
  const u32 = (offset: number) => view.getUint32(offset, true);
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (u32(offset) === 0x06054b50 && offset + 22 + u16(offset + 20) === bytes.length) { end = offset; break; }
  }
  if (end < 0) throw new Error('XLSX_ARCHIVE_DIRECTORY_INVALID');
  const entries = u16(end + 10), size = u32(end + 12), start = u32(end + 16);
  if (u16(end + 4) || u16(end + 6) || u16(end + 8) !== entries ||
    entries === 65535 || size === 0xffffffff || start === 0xffffffff)
    throw new Error('XLSX_ARCHIVE_UNSUPPORTED_LAYOUT');
  if (!entries || entries > limits.maxEntries) throw new Error('XLSX_ARCHIVE_ENTRY_LIMIT');
  if (start + size !== end) throw new Error('XLSX_ARCHIVE_DIRECTORY_INVALID');
  let cursor = start, expandedBytes = 0;
  const names = new Set<string>();
  for (let index = 0; index < entries; index++) {
    if (cursor + 46 > end || u32(cursor) !== 0x02014b50) throw new Error('XLSX_ARCHIVE_DIRECTORY_INVALID');
    const flags = u16(cursor + 8), method = u16(cursor + 10);
    const compressed = u32(cursor + 20), expanded = u32(cursor + 24), local = u32(cursor + 42);
    const nameLength = u16(cursor + 28), extraLength = u16(cursor + 30), commentLength = u16(cursor + 32);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > end || !nameLength || u16(cursor + 34) !== 0 ||
      compressed === 0xffffffff || expanded === 0xffffffff || local === 0xffffffff)
      throw new Error('XLSX_ARCHIVE_UNSUPPORTED_LAYOUT');
    if ((flags & 0x2041) || ![0, 8].includes(method)) throw new Error('XLSX_ARCHIVE_UNSUPPORTED_COMPRESSION');
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = new TextDecoder('utf-8', { fatal: true }).decode(nameBytes);
    if (names.has(name)) throw new Error('XLSX_ARCHIVE_DUPLICATE_ENTRY');
    names.add(name);
    if (local + 30 > start || u32(local) !== 0x04034b50 || u16(local + 6) !== flags || u16(local + 8) !== method)
      throw new Error('XLSX_ARCHIVE_LOCAL_HEADER_INVALID');
    const localNameLength = u16(local + 26), localExtraLength = u16(local + 28);
    const dataStart = local + 30 + localNameLength + localExtraLength;
    if (dataStart + compressed > start || localNameLength !== nameLength ||
      !nameBytes.every((value, position) => bytes[local + 30 + position] === value))
      throw new Error('XLSX_ARCHIVE_LOCAL_HEADER_INVALID');
    if (!(flags & 8) && (u32(local + 18) !== compressed || u32(local + 22) !== expanded))
      throw new Error('XLSX_ARCHIVE_SIZE_MISMATCH');
    expandedBytes += expanded;
    if (!Number.isSafeInteger(expandedBytes) || expandedBytes > limits.maxExpandedBytes)
      throw new Error('XLSX_ARCHIVE_EXPANDED_LIMIT');
    const compressedBytes = bytes.subarray(dataStart, dataStart + compressed);
    let output: Uint8Array;
    try {
      output = method === 0 ? compressedBytes : inflateRawSync(compressedBytes, { maxOutputLength: Math.max(1, expanded) });
    } catch {
      throw new Error('XLSX_ARCHIVE_DECOMPRESSION_FAILED');
    }
    if (output.length !== expanded) throw new Error('XLSX_ARCHIVE_ACTUAL_SIZE_MISMATCH');
    if (crc32(output) !== u32(cursor + 16)) throw new Error('XLSX_ARCHIVE_CHECKSUM_MISMATCH');
    cursor = next;
  }
  if (cursor !== end) throw new Error('XLSX_ARCHIVE_DIRECTORY_INVALID');
  return { entries, expandedBytes };
}
