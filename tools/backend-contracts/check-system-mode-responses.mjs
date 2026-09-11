import { readFile, writeFile } from 'node:fs/promises';
import { parseDocument } from 'yaml';
import { missingServiceUnavailableResponses } from './system-mode-response-policy.mjs';
const file = new URL('../../docs/backend-contracts/openapi.yaml', import.meta.url);
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--write')) throw new Error('Only --write is supported');
const doc = parseDocument(await readFile(file, 'utf8'));
if (doc.errors.length) throw new Error(doc.errors.map(error => error.message).join('\n'));
const api = doc.toJS();
const missing = missingServiceUnavailableResponses(api);
if (args.includes('--write')) {
  for (const {path, method} of missing) doc.setIn(['paths', path, method, 'responses', '503'], { $ref: '#/components/responses/ServiceUnavailable' });
  if (missing.length) await writeFile(file, doc.toString({ lineWidth: 100 }), 'utf8');
  console.log(`Added service-unavailable response declarations to ${missing.length} mutations.`);
} else if (missing.length) {
  throw new Error(`Mutations missing service-unavailable responses:\n${missing.map(({path,method}) => `${method.toUpperCase()} ${path}`).join('\n')}`);
} else console.log('Service-unavailable response coverage verified for every mutation.');
