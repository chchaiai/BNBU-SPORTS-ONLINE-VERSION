import { Worker } from 'node:worker_threads';
import type { RosterSourceTable } from './roster-xlsx.js';

let active = 0;
/** Per-process admission bound; callers persist source bytes before starting interpretation. */
export async function readRosterXlsxIsolated(bytes: Uint8Array, sheetName: string,
  mapping: { studentNumber: string; fullName: string }, timeoutMs = 5000): Promise<RosterSourceTable> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000)
    throw new Error('ROSTER_XLSX_TIMEOUT_INVALID');
  if (!bytes.length || bytes.length > 100 * 1024 * 1024) throw new Error('ROSTER_XLSX_SIZE_OR_FORMAT');
  if (active >= 2) throw new Error('ROSTER_XLSX_BUSY');
  active++;
  let worker: Worker | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    worker = new Worker(new URL('./roster-xlsx-worker.js', import.meta.url), {
      workerData: { bytes, sheetName, mapping }, execArgv: [],
      resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
    });
    const running = worker;
    return await new Promise<RosterSourceTable>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('ROSTER_XLSX_TIMEOUT')), timeoutMs);
      running.once('message', (message: { table?: RosterSourceTable; error?: string }) => {
        if (message.error) reject(new Error(message.error));
        else if (message.table && Array.isArray(message.table.rows) && Array.isArray(message.table.headers)) resolve(message.table);
        else reject(new Error('ROSTER_XLSX_WORKER_RESULT_INVALID'));
      });
      running.once('error', () => reject(new Error('ROSTER_XLSX_WORKER_FAILED')));
      running.once('exit', () => reject(new Error('ROSTER_XLSX_WORKER_EXITED')));
    });
  } finally {
    if (timer) clearTimeout(timer);
    if (worker) await worker.terminate();
    active--;
  }
}
