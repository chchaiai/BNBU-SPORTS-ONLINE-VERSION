import fs from 'node:fs';
import { parse } from 'yaml';

const contract = new URL('../../docs/backend-contracts/', import.meta.url);
const api = parse(fs.readFileSync(new URL('openapi.yaml', contract), 'utf8'));
const file = new URL('05-permission-matrix.md', contract);
const original = fs.readFileSync(file, 'utf8');
const start = '<!-- ACCESS_POLICY_REGISTRY:START -->';
const end = '<!-- ACCESS_POLICY_REGISTRY:END -->';
const begin = original.indexOf(start), finish = original.indexOf(end);
if (begin < 0 || finish <= begin || original.indexOf(start, begin + start.length) !== -1 || original.indexOf(end, finish + end.length) !== -1) throw new Error('Expected one permission registry block');
const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);
const ids = new Set();
const lines = [start, '<!-- Generated from openapi.yaml; do not edit rows by hand. -->',
  '| Method | Path | operationId | policyId | Auth | Roles | Org scope | Resource scope | Resolver | Default deny |',
  '|---|---|---|---|---|---|---|---|---|---|'];
for (const [route, item] of Object.entries(api.paths)) for (const [method, operation] of Object.entries(item)) {
  if (!methods.has(method)) continue;
  const policy = operation['x-access-policy'];
  if (!policy || ids.has(operation.operationId)) throw new Error(`Missing policy or duplicate operation: ${operation.operationId}`);
  ids.add(operation.operationId);
  const values = [method.toUpperCase(), route, operation.operationId, policy.policyId, policy.authentication,
    policy.allowedRoles?.join(',') || '-', policy.organizationScope, policy.resourceScope, policy.resourceResolver, String(policy.defaultDeny)];
  if (values.some(value => typeof value !== 'string' || !value || /[|\r\n`]/.test(value))) throw new Error(`Invalid registry cell: ${operation.operationId}`);
  lines.push('| ' + values.map(value => '`' + value + '`').join(' | ') + ' |');
}
lines.push(end);
const updated = original.slice(0, begin) + lines.join('\n') + original.slice(finish + end.length);
if (process.argv.includes('--write')) fs.writeFileSync(file, updated);
else if (updated.replaceAll('\r\n', '\n') !== original.replaceAll('\r\n', '\n')) throw new Error('Permission registry is stale; run with --write');
console.log(`Permission registry ${process.argv.includes('--write') ? 'generated' : 'checked'}: ${ids.size} operations`);
