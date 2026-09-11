import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const reportPath = process.env.BNBU_RUNTIME_CONFORMANCE_REPORT;
if (reportPath === undefined || reportPath.length === 0) {
  throw new Error('BNBU_RUNTIME_CONFORMANCE_REPORT is required for runtime conformance');
}
const collectOnly = process.env.BNBU_RUNTIME_CONFORMANCE_MODE === 'collect';

const document = JSON.parse(
  readFileSync(resolve('src/generated/openapi.document.generated.json'), 'utf8'),
);
const originalFetch = globalThis.fetch;
const ajv = new Ajv2020({
  allErrors: true,
  allowUnionTypes: true,
  strict: false,
  validateFormats: true,
});
addFormats(ajv);

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);
const validatorCache = new Map();
const SCHEMA_REGISTRY_ID = 'urn:bnbu:runtime-conformance';
const serverBasePath = new URL(
  document.servers?.[0]?.url ?? '/',
  'http://localhost',
).pathname.replace(/\/$/u, '');

function jsonPointer(root, reference) {
  if (!reference.startsWith('#/')) throw new Error(`Unsupported external reference: ${reference}`);
  return reference
    .slice(2)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((value, segment) => value?.[segment], root);
}

function resolveObject(value) {
  const visited = new Set();
  let resolved = value;
  while (resolved !== null && typeof resolved === 'object' && '$ref' in resolved) {
    if (visited.has(resolved.$ref)) throw new Error(`Cyclic OpenAPI reference: ${resolved.$ref}`);
    visited.add(resolved.$ref);
    const next = jsonPointer(document, resolved.$ref);
    if (next === undefined) throw new Error(`Unresolved OpenAPI reference: ${resolved.$ref}`);
    resolved = next;
  }
  return resolved;
}

function normalizeSchema(value) {
  if (Array.isArray(value)) return value.map(normalizeSchema);
  if (value === null || typeof value !== 'object') return value;
  const normalized = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === '$ref' && typeof child === 'string' && child.startsWith('#/components/schemas/')) {
      normalized.$ref = child.replace('#/components/schemas/', `${SCHEMA_REGISTRY_ID}#/$defs/`);
    } else {
      normalized[key] = normalizeSchema(child);
    }
  }
  return normalized;
}

const normalizedComponents = Object.fromEntries(
  Object.entries(document.components?.schemas ?? {}).map(([name, schema]) => [
    name,
    normalizeSchema(schema),
  ]),
);
ajv.addSchema({ $id: SCHEMA_REGISTRY_ID, $defs: normalizedComponents });

function validatorFor(schema) {
  const normalized = normalizeSchema(schema);
  const cacheKey = JSON.stringify(normalized);
  let validator = validatorCache.get(cacheKey);
  if (validator === undefined) {
    validator = ajv.compile(normalized);
    validatorCache.set(cacheKey, validator);
  }
  return validator;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const operations = [];
for (const [template, rawPathItem] of Object.entries(document.paths ?? {})) {
  const pathItem = resolveObject(rawPathItem);
  const parameterNames = [];
  const expression = `${serverBasePath}${template}`
    .split(/(\{[^}]+\})/u)
    .map((segment) => {
      const match = segment.match(/^\{([^}]+)\}$/u);
      if (match === null) return escapeRegExp(segment);
      parameterNames.push(match[1]);
      return '([^/]+)';
    })
    .join('');
  for (const [method, rawOperation] of Object.entries(pathItem)) {
    if (!HTTP_METHODS.has(method)) continue;
    operations.push({
      method: method.toUpperCase(),
      operation: resolveObject(rawOperation),
      parameterNames,
      pathItem,
      regex: new RegExp(`^${expression}$`, 'u'),
      template,
    });
  }
}

function matchOperation(method, pathname) {
  for (const candidate of operations) {
    if (candidate.method !== method) continue;
    const match = pathname.match(candidate.regex);
    if (match === null) continue;
    return {
      ...candidate,
      pathParameters: Object.fromEntries(
        candidate.parameterNames.map((name, index) => [name, decodeURIComponent(match[index + 1])]),
      ),
    };
  }
  return undefined;
}

function parameterValue(parameter, request, url, pathParameters) {
  switch (parameter.in) {
    case 'path':
      return pathParameters[parameter.name];
    case 'query': {
      const values = url.searchParams.getAll(parameter.name);
      if (values.length === 0) return undefined;
      if (parameter.schema?.type === 'array') return values.flatMap((value) => value.split(','));
      return values.at(-1);
    }
    case 'header':
      return request.headers.get(parameter.name) ?? undefined;
    case 'cookie': {
      const cookie = request.headers.get('cookie');
      if (cookie === null) return undefined;
      const entry = cookie
        .split(';')
        .map((part) => part.trim().split('='))
        .find(([name]) => name === parameter.name);
      return entry?.slice(1).join('=');
    }
    default:
      return undefined;
  }
}

function coerceParameter(value, schema) {
  if (value === undefined) return value;
  if (schema?.type === 'integer') return Number.parseInt(value, 10);
  if (schema?.type === 'number') return Number(value);
  if (schema?.type === 'boolean')
    return value === 'true' ? true : value === 'false' ? false : value;
  if (schema?.type === 'array' && Array.isArray(value)) {
    return value.map((entry) => coerceParameter(entry, schema.items));
  }
  return value;
}

async function validateRequest(match, request, url) {
  const parameters = [...(match.pathItem.parameters ?? []), ...(match.operation.parameters ?? [])];
  for (const rawParameter of parameters) {
    const parameter = resolveObject(rawParameter);
    const rawValue = parameterValue(parameter, request, url, match.pathParameters);
    if (parameter.required === true && rawValue === undefined) {
      throw new Error(`required ${parameter.in} parameter ${parameter.name} is absent`);
    }
    if (rawValue !== undefined && parameter.schema !== undefined) {
      const validator = validatorFor(parameter.schema);
      const value = coerceParameter(rawValue, parameter.schema);
      if (!validator(value)) {
        throw new Error(
          `${parameter.in} parameter ${parameter.name} violates schema: ${ajv.errorsText(validator.errors)}`,
        );
      }
    }
  }

  if (match.operation.requestBody === undefined) return;
  const requestBody = resolveObject(match.operation.requestBody);
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType === undefined) {
    if (requestBody.required === true) throw new Error('required request body is absent');
    return;
  }
  const media = requestBody.content?.[contentType];
  if (media === undefined) throw new Error(`request content type ${contentType} is not documented`);
  if (media.schema === undefined || contentType !== 'application/json') return;
  const text = await request.clone().text();
  if (text.length === 0) {
    if (requestBody.required === true) throw new Error('required JSON request body is empty');
    return;
  }
  const value = JSON.parse(text);
  const validator = validatorFor(media.schema);
  if (!validator(value)) {
    throw new Error(`request body violates schema: ${ajv.errorsText(validator.errors)}`);
  }
}

async function responseValue(response, mediaType) {
  if (response.status === 204 || response.status === 304) return undefined;
  if (mediaType === 'application/json' || mediaType.endsWith('+json')) {
    const text = await response.clone().text();
    return text.length === 0 ? undefined : JSON.parse(text);
  }
  return response.clone().text();
}

async function validateResponse(match, response) {
  const rawResponse =
    match.operation.responses?.[String(response.status)] ?? match.operation.responses?.default;
  if (rawResponse === undefined)
    throw new Error(`response status ${response.status} is not documented`);
  const responseDefinition = resolveObject(rawResponse);
  const declaredContent = responseDefinition.content ?? {};
  if (Object.keys(declaredContent).length === 0) {
    const text = await response.clone().text();
    if (text.length > 0)
      throw new Error(`response status ${response.status} has an undocumented body`);
    return;
  }
  const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType === undefined)
    throw new Error(`response status ${response.status} has no content-type`);
  const media = declaredContent[contentType] ?? declaredContent['*/*'];
  if (media === undefined) {
    throw new Error(
      `response content type ${contentType} is not documented for status ${response.status}`,
    );
  }
  if (media.schema === undefined) return;
  const value = await responseValue(response, contentType);
  const validator = validatorFor(media.schema);
  if (!validator(value)) {
    throw new Error(`response body violates schema: ${ajv.errorsText(validator.errors)}`);
  }
}

function appendResult(result) {
  appendFileSync(reportPath, `${JSON.stringify(result)}\n`, 'utf8');
}

globalThis.fetch = async function conformanceFetch(input, init) {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/v1/')) return originalFetch(input, init);
  const match = matchOperation(request.method.toUpperCase(), url.pathname);
  if (match === undefined) {
    appendResult({ method: request.method, path: url.pathname, valid: false, phase: 'routing' });
    if (!collectOnly) {
      throw new Error(
        `Runtime request has no OpenAPI operation: ${request.method} ${url.pathname}`,
      );
    }
    return originalFetch(input, init);
  }

  try {
    await validateRequest(match, request, url);
  } catch (error) {
    appendResult({
      operationId: match.operation.operationId,
      method: request.method,
      template: match.template,
      phase: 'request-negative-fixture',
      requestSchemaValid: false,
      valid: true,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const response = await originalFetch(input, init);
  try {
    await validateResponse(match, response);
    appendResult({
      operationId: match.operation.operationId,
      method: request.method,
      template: match.template,
      phase: 'response',
      status: response.status,
      responseClass: response.status >= 200 && response.status < 300 ? 'success' : 'error',
      valid: true,
    });
  } catch (error) {
    appendResult({
      operationId: match.operation.operationId,
      method: request.method,
      template: match.template,
      phase: 'response',
      status: response.status,
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    });
    if (!collectOnly) throw error;
  }
  return response;
};
