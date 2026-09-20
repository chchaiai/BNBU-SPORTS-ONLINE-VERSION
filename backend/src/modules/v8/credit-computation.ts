import { Worker } from 'node:worker_threads';
import { ApplicationError } from '../../common/errors/application-error.js';
import { selectCredits } from './domain/crediting.js';

let active = 0;
const unavailable = () => new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE', 503, { dependency: 'CREDIT_COMPUTATION' });

/** Exact calculation, bounded independently of the HTTP event loop. No queue
 * waits while holding transaction locks. On overload the transaction rolls back. */
export async function computeCredits(...args: Parameters<typeof selectCredits>): Promise<ReturnType<typeof selectCredits>> {
  if (args[0].length <= 12) return selectCredits(...args);
  if (active >= 2) throw unavailable();
  active++;
  let thread: Worker | undefined;
  try {
    return await new Promise((resolve, reject) => {
      const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js';
      const worker = thread = new Worker(`const {parentPort,workerData}=require('node:worker_threads');
        import(workerData.url).then(({selectCredits})=>parentPort.postMessage(selectCredits(...workerData.args)));`, {
        eval: true, execArgv: [],
        workerData: { url: new URL(`./domain/crediting.${extension}`, import.meta.url).href, args },
        resourceLimits: { maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 32 },
      });
      const timer = setTimeout(() => { void worker.terminate(); reject(unavailable()); }, 1500);
      worker.once('message', result => { clearTimeout(timer); resolve(result); void worker.terminate(); });
      worker.once('error', () => { clearTimeout(timer); reject(unavailable()); });
      worker.once('exit', () => { clearTimeout(timer); reject(unavailable()); });
    });
  } finally { await thread?.terminate(); active--; }
}
