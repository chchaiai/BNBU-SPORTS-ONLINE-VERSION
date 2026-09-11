import { parentPort, workerData } from 'node:worker_threads';
import { readRosterXlsx } from './roster-xlsx.js';
import { inspectXlsxArchiveBudget } from './xlsx-archive-budget.js';

if (!parentPort) throw new Error('ROSTER_XLSX_WORKER_REQUIRED');
try {
  const input = workerData as { bytes: Uint8Array; sheetName: string; mapping: { studentNumber: string; fullName: string } };
  inspectXlsxArchiveBudget(input.bytes);
  parentPort.postMessage({ table: readRosterXlsx(input.bytes, input.sheetName, input.mapping) });
} catch (error) {
  parentPort.postMessage({ error: error instanceof Error ? error.message : 'ROSTER_XLSX_INVALID' });
}
