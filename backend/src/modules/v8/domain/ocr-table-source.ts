/** Provider output remains untrusted draft evidence, never a roster or physical result. */
export type OcrCell = { text: string; rowStart: number; rowEnd: number; columnStart: number; columnEnd: number;
  confidence: number | null; polygon: { x: number; y: number }[] };
export type OcrTableSource = { provider: 'TENCENT_TABLE_V3'; requestId: string;
  sourceSha256: string; requiresTeacherConfirmation: true; tables: { cells: OcrCell[] }[] };
const invalid = () => new Error('OCR_PROVIDER_RESPONSE_INVALID');
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
};
const index = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 100000) throw invalid();
  return value;
};

/** No inferred headers, number parsing, name matching, cell merging, or confidence-based approval. */
export function decodeTencentTableSource(value: unknown, sourceSha256: string): OcrTableSource {
  if (!/^[a-f0-9]{64}$/.test(sourceSha256)) throw new Error('OCR_SOURCE_DIGEST_INVALID');
  const response = object(value);
  if (response.Error !== undefined) throw new Error('OCR_PROVIDER_REJECTED');
  if (typeof response.RequestId !== 'string' || !response.RequestId.trim() || response.RequestId.length > 128) throw invalid();
  if (!Array.isArray(response.TableDetections) || response.TableDetections.length === 0) throw new Error('OCR_NO_TABLE_DETECTED');
  // Resource bounds for provider evidence. Business personnel-row limits apply after explicit header/table selection.
  if (response.TableDetections.length > 32) throw new Error('OCR_PROVIDER_RESPONSE_LIMIT');
  let cellCount = 0, textLength = 0;
  const tables = response.TableDetections.map(input => {
    const table = object(input);
    if (!Array.isArray(table.Cells) || table.Cells.length === 0) throw new Error('OCR_EMPTY_TABLE');
    cellCount += table.Cells.length;
    if (cellCount > 32000) throw new Error('OCR_PROVIDER_RESPONSE_LIMIT');
    return { cells: table.Cells.map(inputCell => {
      const cell = object(inputCell);
      if (typeof cell.Text !== 'string' || cell.Text.length > 16384) throw invalid();
      textLength += cell.Text.length;
      if (textLength > 1048576) throw new Error('OCR_PROVIDER_RESPONSE_LIMIT');
      const rowStart = index(cell.RowTl), rowEnd = index(cell.RowBr);
      const columnStart = index(cell.ColTl), columnEnd = index(cell.ColBr);
      if (rowEnd < rowStart || columnEnd < columnStart) throw invalid();
      const confidence = cell.Confidence == null ? null : cell.Confidence;
      if (confidence !== null && (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 100)) throw invalid();
      if (!Array.isArray(cell.Polygon) || cell.Polygon.length !== 4) throw invalid();
      const polygon = cell.Polygon.map(inputPoint => {
        const point = object(inputPoint);
        return { x: index(point.X), y: index(point.Y) };
      });
      return { text: cell.Text, rowStart, rowEnd, columnStart, columnEnd, confidence, polygon };
    }) };
  });
  return { provider: 'TENCENT_TABLE_V3', requestId: response.RequestId, sourceSha256,
    requiresTeacherConfirmation: true, tables };
}
