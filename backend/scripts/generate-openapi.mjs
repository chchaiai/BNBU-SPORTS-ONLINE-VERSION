import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(scriptDirectory, '..');
const repositoryDirectory = path.resolve(backendDirectory, '..');
const sourcePath = path.join(repositoryDirectory, 'docs', 'backend-contracts', 'openapi.yaml');
const generatedDirectory = path.join(backendDirectory, 'src', 'generated');
const apiTypesDirectory = path.join(generatedDirectory, 'api-types');
const policiesPath = path.join(generatedDirectory, 'operation-policies.generated.ts');
const documentPath = path.join(generatedDirectory, 'openapi.document.generated.json');
const manifestPath = path.join(generatedDirectory, 'openapi.manifest.generated.json');
const checkOnly = process.argv.includes('--check');

const source = fs.readFileSync(sourcePath, 'utf8');
const document = parse(source);
const operations = {};
for (const [route, pathItem] of Object.entries(document.paths)) {
  for (const method of ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']) {
    const operation = pathItem[method];
    if (!operation) continue;
    if (!operation.operationId || !operation['x-access-policy']) {
      throw new Error(`${method.toUpperCase()} ${route} lacks operationId or x-access-policy`);
    }
    operations[operation.operationId] = {
      method: method.toUpperCase(),
      route,
      ...operation['x-access-policy'],
    };
  }
}

const policiesOutput = `/* eslint-disable */
// Generated from docs/backend-contracts/openapi.yaml. Do not edit.

export const operationPolicies = ${JSON.stringify(operations, null, 2)} as const;

export type OperationId = keyof typeof operationPolicies;
export type OperationPolicy = (typeof operationPolicies)[OperationId];
`;

const normalizedDocument = `${JSON.stringify(document, null, 2)}\n`;
const manifest = {
  source: 'docs/backend-contracts/openapi.yaml',
  sha256: crypto.createHash('sha256').update(source).digest('hex'),
  openapi: document.openapi,
  paths: Object.keys(document.paths).length,
  operations: Object.keys(operations).length,
  schemas: Object.keys(document.components.schemas).length,
};
const manifestOutput = `${JSON.stringify(manifest, null, 2)}\n`;

const outputs = new Map([
  [policiesPath, policiesOutput],
  [documentPath, normalizedDocument],
  [manifestPath, manifestOutput],
]);

if (checkOnly) {
  const stale = [];
  for (const [targetPath, expected] of outputs) {
    const actual = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : undefined;
    if (actual !== expected) stale.push(path.relative(repositoryDirectory, targetPath));
  }
  if (stale.length > 0) {
    throw new Error(`Generated OpenAPI artifacts are stale or missing: ${stale.join(', ')}`);
  }
  process.stdout.write(`Generated OpenAPI artifacts: PASS (${manifest.operations} operations)\n`);
} else {
  fs.mkdirSync(apiTypesDirectory, { recursive: true });
  for (const [targetPath, contents] of outputs) fs.writeFileSync(targetPath, contents);
  process.stdout.write(
    `Generated ${outputs.size} OpenAPI artifacts from ${manifest.operations} operations.\n`,
  );
}
