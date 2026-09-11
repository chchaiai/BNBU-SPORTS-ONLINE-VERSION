import { existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const layer = process.argv[2];
if (layer === undefined || !/^[a-z0-9-]+$/.test(layer)) {
  throw new Error('A safe test layer name is required');
}

const directory = resolve('test', layer);
if (!existsSync(directory)) throw new Error(`Test layer does not exist: ${layer}`);
const files = readdirSync(directory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.test.ts'))
  .map((entry) => resolve(directory, entry.name))
  .sort();
if (files.length === 0) throw new Error(`No tests were found for layer: ${layer}`);

const imports = ['--import', 'tsx'];
const environment = { ...process.env };
if (layer === 'e2e') {
  const reportPath = resolve(tmpdir(), 'bnbu-runtime-conformance-e2e.ndjson');
  rmSync(reportPath, { force: true });
  environment.BNBU_RUNTIME_CONFORMANCE_REPORT = reportPath;
  imports.push('--import', pathToFileURL(resolve('scripts/runtime-conformance-hook.mjs')).href);
}

const result = spawnSync(
  process.execPath,
  [...imports, '--test', '--test-concurrency=1', ...files],
  { stdio: 'inherit', env: environment },
);
if (result.error !== undefined) throw result.error;
let status = result.status ?? 1;
if (layer === 'e2e' && status === 0) {
  const conformance = spawnSync(
    process.execPath,
    [
      resolve('scripts/check-runtime-conformance-report.mjs'),
      `--report=${environment.BNBU_RUNTIME_CONFORMANCE_REPORT}`,
    ],
    { stdio: 'inherit', env: environment },
  );
  if (conformance.error !== undefined) throw conformance.error;
  status = conformance.status ?? 1;
}
process.exitCode = status;
