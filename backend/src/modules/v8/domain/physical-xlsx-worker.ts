import { parentPort, workerData } from 'node:worker_threads';
import { readPhysicalXlsx } from './physical-xlsx.js';

if (!parentPort) throw new Error('PHYSICAL_XLSX_WORKER_REQUIRED');
try {
  const input = workerData as { bytes: Uint8Array; sheetName: string; maxBytes: number; maxRows: number };
  parentPort.postMessage({ rows: readPhysicalXlsx(input.bytes, input.sheetName, input) });
} catch (error) {
  parentPort.postMessage({ error: error instanceof Error ? error.message : 'PHYSICAL_XLSX_INVALID' });
}
