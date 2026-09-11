import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { format } from 'prettier';
import { parse } from 'yaml';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(scriptDirectory, '..');
const repositoryDirectory = path.resolve(backendDirectory, '..');
const openApiPath = path.join(repositoryDirectory, 'docs', 'backend-contracts', 'openapi.yaml');
const roadmapPath = path.join(
  repositoryDirectory,
  'docs',
  'backend-contracts',
  'backend-implementation-roadmap.md',
);
const manifestPath = path.join(backendDirectory, 'runtime-coverage.manifest.json');
const write = process.argv.includes('--write');
const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);

const contract = parse(fs.readFileSync(openApiPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const operations = [];
for (const [route, pathItem] of Object.entries(contract.paths)) {
  for (const [method, operation] of Object.entries(pathItem)) {
    if (!methods.has(method)) continue;
    operations.push({ route, method: method.toUpperCase(), ...operation });
  }
}
operations.sort((left, right) => left.operationId.localeCompare(right.operationId));

if (operations.length !== manifest.expectedOperationCount) {
  throw new Error(
    `OpenAPI operation count changed: expected ${manifest.expectedOperationCount}, found ${operations.length}`,
  );
}
const operationIds = new Set(operations.map(({ operationId }) => operationId));
if (operationIds.size !== operations.length)
  throw new Error('OpenAPI operationId values are not unique');

const policySource = fs.readFileSync(
  path.join(backendDirectory, 'src', 'generated', 'operation-policies.generated.ts'),
  'utf8',
);
for (const [operationId, entry] of Object.entries(manifest.implemented)) {
  if (!operationIds.has(operationId))
    throw new Error(`Unknown implemented operation: ${operationId}`);
  const controllerPath = path.join(backendDirectory, entry.controller);
  const contractTestPath = path.join(backendDirectory, entry.contractTest);
  const e2eTestPath = path.join(backendDirectory, entry.e2eTest);
  for (const requiredPath of [controllerPath, contractTestPath, e2eTestPath]) {
    if (!fs.existsSync(requiredPath))
      throw new Error(`Runtime coverage evidence missing: ${requiredPath}`);
  }
  const controllerSource = fs.readFileSync(controllerPath, 'utf8');
  if (!controllerSource.includes(`@OperationPolicy('${operationId}')`)) {
    throw new Error(`${operationId}: Controller policy binding is missing`);
  }
  if (!policySource.includes(`"${operationId}": {`)) {
    throw new Error(`${operationId}: generated policy is missing`);
  }
  for (const field of ['module', 'stage', 'useCase', 'repository', 'migration', 'dockerSmoke']) {
    if (typeof entry[field] !== 'string' || entry[field].length === 0) {
      throw new Error(`${operationId}: ${field} evidence is missing`);
    }
  }
}

for (const operationId of manifest.implementedDefaultDeny) {
  if (!operationIds.has(operationId))
    throw new Error(`Unknown default-deny operation: ${operationId}`);
  if (manifest.implemented[operationId] === undefined) {
    throw new Error(`${operationId}: default deny must have real Controller and test evidence`);
  }
}

function blockers(operation) {
  const values = [];
  if (typeof operation['x-business-blocker'] === 'string') {
    values.push(operation['x-business-blocker']);
  }
  if (Array.isArray(operation['x-business-blockers'])) {
    values.push(...operation['x-business-blockers']);
  }
  if (typeof operation['x-implementation-gate'] === 'string') {
    values.push(operation['x-implementation-gate']);
  }
  return values;
}

function plannedStage(operation) {
  const route = operation.route;
  if (/enroll|course-invite|join-capabilit/.test(route)) return 'Stage 12';
  if (/roster/.test(route)) return 'Stage 13';
  if (/exercise-session/.test(route)) return 'Stage 14';
  if (/review/.test(route)) return 'Future - Review Gate';
  if (/exercise-record/.test(route)) return 'Future - Record Gate';
  if (/media/.test(route)) return 'Future - Media Gate';
  if (/score/.test(route)) return 'Future - Score Gate';
  if (/export/.test(route)) return 'Future - Export Gate';
  return 'TBD';
}

function markdownCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

const rows = operations.map((operation) => {
  const evidence = manifest.implemented[operation.operationId];
  const dependencies = blockers(operation);
  const isDefaultDeny = manifest.implementedDefaultDeny.includes(operation.operationId);
  const status =
    evidence === undefined
      ? dependencies.some((value) => value.startsWith('ADR-'))
        ? 'UNREGISTERED_WITH_ADR'
        : 'NOT_REGISTERED'
      : isDefaultDeny
        ? 'DENIAL_EVIDENCE_REGISTERED'
        : 'EVIDENCE_REGISTERED';
  return {
    operationId: operation.operationId,
    method: operation.method,
    route: operation.route,
    module: evidence?.module ?? operation.tags?.join('/') ?? 'Unclassified',
    policyId: operation['x-access-policy'].policyId,
    status,
    stage: evidence?.stage ?? plannedStage(operation),
    dependency: dependencies.join(', ') || '—',
    controller: evidence?.controller ?? '—',
    useCase: evidence?.useCase ?? '—',
    repository: evidence?.repository ?? '—',
    migration: evidence?.migration ?? '—',
    contractTest: evidence?.contractTest ?? '—',
    e2eTest: evidence?.e2eTest ?? '—',
    dockerSmoke: evidence?.dockerSmoke ?? '—',
  };
});

const counts = Object.fromEntries(
  ['EVIDENCE_REGISTERED', 'DENIAL_EVIDENCE_REGISTERED', 'NOT_REGISTERED', 'UNREGISTERED_WITH_ADR'].map(
    (status) => [status, rows.filter((row) => row.status === status).length],
  ),
);
if (
  counts.EVIDENCE_REGISTERED + counts.DENIAL_EVIDENCE_REGISTERED !==
  Object.keys(manifest.implemented).length
) {
  throw new Error('Implemented operation count does not match the evidence manifest');
}

const heading = [
  '# Backend Implementation Roadmap',
  '',
  '> Generated from `docs/backend-contracts/openapi.yaml` and `backend/runtime-coverage.manifest.json`. Static registration only: controller bindings and referenced files exist. This is not runtime validation, business completion, or deployment acceptance. See the strict HTTP runtime report for observed results.',
  '',
  `- OpenAPI operations: ${operations.length}`,
  `- EVIDENCE_REGISTERED: ${counts.EVIDENCE_REGISTERED}`,
  `- DENIAL_EVIDENCE_REGISTERED: ${counts.DENIAL_EVIDENCE_REGISTERED}`,
  `- NOT_REGISTERED: ${counts.NOT_REGISTERED}`,
  `- UNREGISTERED_WITH_ADR: ${counts.UNREGISTERED_WITH_ADR}`,
  '',
  '| operationId | method | path | module | policyId | 当前状态 | 计划阶段 | 依赖 ADR/Gate | Controller | Application Use Case | Repository | Migration | Contract Test | E2E Test | Docker Smoke |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
];
const table = rows.map((row) =>
  [
    row.operationId,
    row.method,
    row.route,
    row.module,
    row.policyId,
    row.status,
    row.stage,
    row.dependency,
    row.controller,
    row.useCase,
    row.repository,
    row.migration,
    row.contractTest,
    row.e2eTest,
    row.dockerSmoke,
  ]
    .map(markdownCell)
    .join(' | '),
);
const generated = await format([...heading, ...table.map((row) => `| ${row} |`), ''].join('\n'), {
  parser: 'markdown',
  printWidth: 100,
  endOfLine: 'lf',
});

if (write) {
  fs.writeFileSync(roadmapPath, generated, 'utf8');
  process.stdout.write(`Runtime coverage roadmap updated (${operations.length} operations).\n`);
} else if (!fs.existsSync(roadmapPath) || fs.readFileSync(roadmapPath, 'utf8') !== generated) {
  throw new Error('Runtime coverage roadmap is stale; run npm run runtime-coverage:generate');
}

process.stdout.write(
  `Static evidence registration: PASS (operations=${operations.length}, foundation=9, teachingStructure=10, registered=${counts.EVIDENCE_REGISTERED}, defaultDeny=${counts.DENIAL_EVIDENCE_REGISTERED}, notRegistered=${counts.NOT_REGISTERED}, blockedByAdr=${counts.UNREGISTERED_WITH_ADR})\n`,
);
