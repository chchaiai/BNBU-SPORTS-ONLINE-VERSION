import { Worker } from 'node:worker_threads';
import type { PhysicalImportRow } from './physical-import.js';

let active = 0;
const MAX_ACTIVE = 2;
export async function readPhysicalXlsxIsolated(bytes: Uint8Array, sheetName: string,
  limits: { maxBytes: number; maxRows: number; timeoutMs: number }): Promise<PhysicalImportRow[]> {
  if (!Number.isSafeInteger(limits.timeoutMs) || limits.timeoutMs < 1 || limits.timeoutMs > 30000 ||
    !Number.isSafeInteger(limits.maxBytes) || limits.maxBytes < 1 || limits.maxBytes > 10485760 ||
    !Number.isSafeInteger(limits.maxRows) || limits.maxRows < 1 || limits.maxRows > 1000)
    throw new Error('PHYSICAL_XLSX_LIMITS_INVALID');
  if (!bytes.length || bytes.length > limits.maxBytes) throw new Error('PHYSICAL_XLSX_SIZE_OR_FORMAT');
  if (active >= MAX_ACTIVE) throw new Error('PHYSICAL_XLSX_BUSY');
  active++;
  let worker: Worker | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    worker = new Worker(new URL('./physical-xlsx-worker.js', import.meta.url), {
      workerData: { bytes, sheetName, maxBytes: limits.maxBytes, maxRows: limits.maxRows },
      resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 }, execArgv: [],
    });
    const running = worker;
    return await new Promise<PhysicalImportRow[]>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('PHYSICAL_XLSX_TIMEOUT')), limits.timeoutMs);
      running.once('message', (message: { rows?: PhysicalImportRow[]; error?: string }) => {
        if (message.error) reject(new Error(message.error));
        else if (Array.isArray(message.rows)) resolve(message.rows);
        else reject(new Error('PHYSICAL_XLSX_WORKER_RESULT_INVALID'));
      });
      running.once('error', () => reject(new Error('PHYSICAL_XLSX_WORKER_FAILED')));
      running.once('exit', () => reject(new Error('PHYSICAL_XLSX_WORKER_EXITED')));
    });
  } finally {
    if (timer) clearTimeout(timer);
    if (worker) await worker.terminate();
    active--;
  }
}
