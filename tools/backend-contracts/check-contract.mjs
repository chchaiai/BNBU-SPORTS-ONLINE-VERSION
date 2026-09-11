import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { responsePolicyFailures } from './operation-response-policy.mjs';
import { enumSubsetFailures } from './enum-subset-policy.mjs';

const toolDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(toolDirectory, '..', '..');
const contractDirectory = path.join(rootDirectory, 'docs', 'backend-contracts');
const openapiPath = path.join(contractDirectory, 'openapi.yaml');
const permissionMatrixPath = path.join(contractDirectory, '05-permission-matrix.md');
const enumAndErrorPath = path.join(contractDirectory, '07-enums-and-errors.md');
const disabledOperations = new Set(JSON.parse(fs.readFileSync(path.join(rootDirectory, 'backend', 'runtime-coverage.manifest.json'), 'utf8')).implementedDefaultDeny);

const failures = [];
const notes = [];
const fail = (message) => failures.push(message);
const assert = (condition, message) => {
  if (!condition) fail(message);
};
const sorted = (values) => [...values].sort((left, right) => left.localeCompare(right));
const sameArray = (left, right) =>
  Array.isArray(left) &&
  Array.isArray(right) &&
  left.length === right.length &&
  left.every((value, index) => value === right[index]);
const setDiff = (left, right) => sorted(new Set(left.filter((value) => !new Set(right).has(value))));

let openapi;
try {
  openapi = parse(fs.readFileSync(openapiPath, 'utf8'));
} catch (error) {
  console.error(`OpenAPI parse failed: ${error.message}`);
  process.exit(1);
}

assert(openapi?.openapi === '3.1.0', `Expected OpenAPI 3.1.0, found ${openapi?.openapi ?? 'missing'}`);
assert(openapi?.info && openapi?.paths && openapi?.components?.schemas, 'OpenAPI must contain info, paths, and component schemas');

function walk(value, visitor, segments = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visitor, [...segments, String(index)]));
    return;
  }
  if (!value || typeof value !== 'object') return;
  visitor(value, segments);
  for (const [key, child] of Object.entries(value)) walk(child, visitor, [...segments, key]);
}

function resolveLocalReference(reference) {
  if (typeof reference !== 'string' || !reference.startsWith('#/')) return undefined;
  return reference
    .slice(2)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((value, key) => value?.[key], openapi);
}

let referenceCount = 0;
walk(openapi, (value, segments) => {
  if (!('$ref' in value)) return;
  referenceCount += 1;
  const reference = value.$ref;
  assert(typeof reference === 'string' && reference.startsWith('#/'), `External or malformed $ref at ${segments.join('.')}: ${reference}`);
  assert(resolveLocalReference(reference) !== undefined, `Unresolved $ref at ${segments.join('.')}: ${reference}`);
});

const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'];
const operations = [];
for (const [route, pathItem] of Object.entries(openapi.paths ?? {})) {
  for (const method of httpMethods) {
    const operation = pathItem?.[method];
    if (!operation) continue;
    operations.push({ route, method: method.toUpperCase(), operation });
  }
}

const operationIds = operations.map(({ operation }) => operation.operationId);
assert(operationIds.every((operationId) => typeof operationId === 'string' && operationId.length > 0), 'Every operation must have operationId');
const duplicateOperationIds = sorted(operationIds.filter((operationId, index) => operationIds.indexOf(operationId) !== index));
assert(duplicateOperationIds.length === 0, `Duplicate operationId values: ${duplicateOperationIds.join(', ')}`);

for (const { route, method, operation } of operations) {
  const label = `${method} ${route}`;
  for (const failure of responsePolicyFailures(operation, disabledOperations)) fail(`${label} ${failure}`);

  const placeholders = [...route.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
  const parameters = [...(openapi.paths[route]?.parameters ?? []), ...(operation.parameters ?? [])].map((parameter) =>
    parameter?.$ref ? resolveLocalReference(parameter.$ref) : parameter,
  );
  for (const placeholder of placeholders) {
    const parameter = parameters.find((candidate) => candidate?.in === 'path' && candidate?.name === placeholder);
    assert(parameter && parameter.required === true, `${label} is missing required path parameter ${placeholder}`);
  }
  for (const parameter of parameters.filter((candidate) => candidate?.in === 'path')) {
    assert(placeholders.includes(parameter.name), `${label} declares unused path parameter ${parameter.name}`);
  }
}

const requiredPolicyFields = [
  'policyId',
  'authentication',
  'allowedRoles',
  'organizationScope',
  'resourceScope',
  'resourceResolver',
  'defaultDeny',
];
const authentications = new Set(['PUBLIC', 'ACCESS_TOKEN', 'JOIN_CAPABILITY']);
const roles = new Set(['STUDENT', 'TEACHER', 'ADMIN']);
const organizationScopes = new Set(['NONE', 'PRINCIPAL_ORGANIZATION', 'CAPABILITY_ORGANIZATION']);
const resourceScopes = new Set([
  'NONE',
  'SESSION',
  'SELF',
  'ORGANIZATION',
  'ROLE_SCOPED',
  'TEACHER_CLASS_SECTION',
  'PUBLIC_INVITE',
  'CAPABILITY_CLASS_SECTION',
]);
const policiesByOperation = new Map();
const policyIds = [];

for (const { route, method, operation } of operations) {
  const label = `${method} ${route} (${operation.operationId})`;
  const policy = operation['x-access-policy'];
  assert(policy && typeof policy === 'object', `${label} is missing x-access-policy`);
  if (!policy || typeof policy !== 'object') continue;
  for (const field of requiredPolicyFields) assert(field in policy, `${label} policy is missing ${field}`);
  assert(/^[A-Z][A-Z0-9-]*$/.test(policy.policyId ?? ''), `${label} has invalid policyId ${policy.policyId}`);
  assert(authentications.has(policy.authentication), `${label} has unknown authentication ${policy.authentication}`);
  assert(Array.isArray(policy.allowedRoles), `${label} allowedRoles must be an array`);
  for (const role of policy.allowedRoles ?? []) assert(roles.has(role), `${label} has unknown role ${role}`);
  assert(organizationScopes.has(policy.organizationScope), `${label} has unknown organizationScope ${policy.organizationScope}`);
  assert(resourceScopes.has(policy.resourceScope), `${label} has unknown resourceScope ${policy.resourceScope}`);
  assert(/^[A-Z][A-Z0-9_]*$/.test(policy.resourceResolver ?? ''), `${label} has invalid resourceResolver ${policy.resourceResolver}`);
  assert(policy.defaultDeny === true, `${label} must set defaultDeny: true`);
  if (policy.authentication !== 'ACCESS_TOKEN') {
    assert(policy.allowedRoles?.length === 0, `${label} non-access-token policy must have allowedRoles: []`);
  }
  if (policy.authentication === 'PUBLIC') {
    assert(operation.security && sameArray(operation.security, []), `${label} PUBLIC operation must explicitly set security: []`);
    assert(policy.organizationScope === 'NONE', `${label} PUBLIC operation must use organizationScope NONE`);
  }
  if (policy.resourceScope === 'NONE') assert(policy.resourceResolver === 'NONE', `${label} NONE scope must use resolver NONE`);
  policiesByOperation.set(operation.operationId, { route, method, ...policy });
  policyIds.push(policy.policyId);
}

const duplicatePolicyIds = sorted(policyIds.filter((policyId, index) => policyIds.indexOf(policyId) !== index));
assert(duplicatePolicyIds.length === 0, `Duplicate policyId values: ${duplicatePolicyIds.join(', ')}`);

const requiredFoundationPolicies = new Map([
  ['getHealthLive', 'PUBLIC-HEALTH-LIVE'],
  ['getHealthReady', 'PUBLIC-HEALTH-READY'],
  ['getAdminHealth', 'ADMIN-HEALTH-READ'],
  ['getSystemMode', 'PUBLIC-SYSTEM-MODE-READ'],
  ['passwordLogin', 'AUTH-PASSWORD-LOGIN'],
  ['refreshSession', 'AUTH-REFRESH'],
  ['logoutSession', 'AUTH-LOGOUT'],
  ['getCurrentUser', 'USER-SELF-READ'],
  ['getCurrentOrganization', 'ORGANIZATION-CURRENT-READ'],
  ['getCurrentSemester', 'SEMESTER-READ'],
]);
for (const [operationId, policyId] of requiredFoundationPolicies) {
  assert(policiesByOperation.get(operationId)?.policyId === policyId, `${operationId} must map to ${policyId}`);
}

function markdownCells(line) {
  if (!line.startsWith('|') || !line.endsWith('|')) return [];
  return line
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim().replace(/^`|`$/g, ''));
}

const permissionMarkdown = fs.readFileSync(permissionMatrixPath, 'utf8');
const registryMatch = permissionMarkdown.match(
  /<!-- ACCESS_POLICY_REGISTRY:START -->([\s\S]*?)<!-- ACCESS_POLICY_REGISTRY:END -->/,
);
assert(registryMatch, 'Permission registry markers are missing');
const registryRows = new Map();
if (registryMatch) {
  for (const line of registryMatch[1].split(/\r?\n/)) {
    const cells = markdownCells(line);
    if (cells.length !== 10 || !/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|TRACE)$/.test(cells[0])) continue;
    const [method, route, operationId, policyId, authentication, roleCell, organizationScope, resourceScope, resourceResolver, defaultDeny] = cells;
    assert(!registryRows.has(operationId), `Permission registry repeats operationId ${operationId}`);
    registryRows.set(operationId, {
      method,
      route,
      policyId,
      authentication,
      allowedRoles: roleCell === '-' ? [] : roleCell.split(','),
      organizationScope,
      resourceScope,
      resourceResolver,
      defaultDeny: defaultDeny === 'true',
    });
  }
}

for (const [operationId, policy] of policiesByOperation) {
  const row = registryRows.get(operationId);
  assert(row, `OpenAPI operation ${operationId} is missing from permission registry`);
  if (!row) continue;
  for (const field of ['method', 'route', 'policyId', 'authentication', 'organizationScope', 'resourceScope', 'resourceResolver', 'defaultDeny']) {
    assert(row[field] === policy[field], `Permission registry mismatch for ${operationId}.${field}: ${row[field]} != ${policy[field]}`);
  }
  assert(sameArray(row.allowedRoles, policy.allowedRoles), `Permission registry role mismatch for ${operationId}`);
}
for (const operationId of registryRows.keys()) {
  assert(policiesByOperation.has(operationId), `Permission registry operation ${operationId} is missing from OpenAPI`);
}
assert(registryRows.size === operations.length, `Permission registry rows ${registryRows.size} != operations ${operations.length}`);

const enumMarkdown = fs.readFileSync(enumAndErrorPath, 'utf8');
const currentEnumSection = enumMarkdown.match(/## 3\. 当前核心枚举([\s\S]*?)## 5\. 废弃枚举/)?.[1] ?? '';
const documentedEnums = new Map();
const enumI18nKeys = new Set();
for (const line of currentEnumSection.split(/\r?\n/)) {
  const rawCells = markdownCells(line);
  if (rawCells.length < 6) continue;
  const [type, value, , , i18nKey] = rawCells;
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(type) || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value)) continue;
  const values = documentedEnums.get(type) ?? [];
  const declared = openapi.components.schemas[type]?.enum;
  const member = declared?.find(candidate => String(candidate) === value);
  values.push(member === undefined ? value : member);
  documentedEnums.set(type, values);
  assert(i18nKey.startsWith('enum.'), `${type}.${value} is missing a stable enum i18n key`);
  assert(!enumI18nKeys.has(i18nKey), `Duplicate enum i18n key ${i18nKey}`);
  enumI18nKeys.add(i18nKey);
}

const openapiEnums = new Map(
  Object.entries(openapi.components.schemas)
    .filter(([name, schema]) => name !== 'ErrorCode' && Array.isArray(schema?.enum))
    .map(([name, schema]) => [name, schema.enum]),
);
for (const [name, values] of openapiEnums) {
  const documented = documentedEnums.get(name);
  assert(documented, `OpenAPI named enum ${name} is not registered in 07-enums-and-errors.md`);
  if (documented) assert(sameArray(values, documented), `Named enum mismatch for ${name}: OpenAPI=${values.join(',')} docs=${documented.join(',')}`);
}
for (const name of documentedEnums.keys()) assert(openapiEnums.has(name), `Documented enum ${name} is missing from OpenAPI`);

walk(openapi, (value, segments) => {
  if (!Array.isArray(value.enum)) return;
  const isNamedSchema = segments.length === 3 && segments[0] === 'components' && segments[1] === 'schemas';
  if (isNamedSchema) return;
  for (const failure of enumSubsetFailures(value, openapi.components.schemas)) fail(`Inline enum at ${segments.join('.')} ${failure}`);
});

const errorSection = enumMarkdown.match(/## 8\. 标准错误码目录([\s\S]*?)## 9\. 阶段/)?.[1] ?? '';
const documentedErrorCodes = [];
for (const line of errorSection.split(/\r?\n/)) {
  const cells = markdownCells(line);
  if (cells.length >= 2 && /^[A-Z][A-Z0-9_]+$/.test(cells[0])) documentedErrorCodes.push(cells[0]);
}
const baseOpenapiErrorCodes = openapi.components.schemas.ErrorCode?.enum ?? [];
const operationErrorCodes = Object.values(openapi.paths ?? {}).flatMap((pathItem) =>
  Object.entries(pathItem ?? {})
    .filter(([method]) => httpMethods.includes(method.toLowerCase()))
    .flatMap(([, operation]) => operation?.['x-error-codes'] ?? []),
);
const openapiErrorCodes = [...new Set([...baseOpenapiErrorCodes, ...operationErrorCodes])];
const errorsOnlyInDocs = setDiff(documentedErrorCodes, openapiErrorCodes);
const errorsOnlyInOpenapi = setDiff(openapiErrorCodes, documentedErrorCodes);
assert(errorsOnlyInDocs.length === 0, `Error codes only in docs: ${errorsOnlyInDocs.join(', ')}`);
assert(errorsOnlyInOpenapi.length === 0, `Error codes only in OpenAPI: ${errorsOnlyInOpenapi.join(', ')}`);
assert(new Set(documentedErrorCodes).size === documentedErrorCodes.length, '07 error catalog contains duplicate codes');
assert(new Set(openapiErrorCodes).size === openapiErrorCodes.length, 'OpenAPI ErrorCode contains duplicate codes');

const schemas = openapi.components.schemas;
assert(sameArray(schemas.ExerciseRecordStatus?.enum, ['DRAFT', 'SUBMITTED', 'REVIEWED', 'CANCELLED']), 'ExerciseRecordStatus must contain exactly four V1 values');
assert(!Object.keys(openapi.paths).some((route) => route.includes('claim-review')), 'claim-review path must not exist');
assert(!operationIds.some((operationId) => /claim/i.test(operationId)), 'claim operationId must not exist');
const serializedOpenapi = JSON.stringify(openapi);
assert(!serializedOpenapi.includes('CLAIM_REVIEW'), 'CLAIM_REVIEW must not exist in OpenAPI');
assert(!serializedOpenapi.includes('UNDER_REVIEW'), 'UNDER_REVIEW must not exist in OpenAPI');
assert(!serializedOpenapi.includes('currentReviewResult'), 'currentReviewResult must be replaced by currentReview');

const currentReview = schemas.StudentCurrentReview;
assert(currentReview?.additionalProperties === false, 'StudentCurrentReview must reject undeclared fields');
assert(sameArray(currentReview?.required, ['result', 'reasonCode', 'publicComment']), 'StudentCurrentReview required fields must be exact');
assert(
  sameArray(Object.keys(currentReview?.properties ?? {}), ['result', 'reasonCode', 'publicComment']),
  'StudentCurrentReview properties must be exactly result/reasonCode/publicComment',
);
assert(schemas.ExerciseRecord?.properties?.currentReview?.oneOf, 'ExerciseRecord must expose nullable currentReview');

const reviewRecord = schemas.ReviewRecord;
assert(reviewRecord?.required?.includes('teacherId'), 'ReviewRecord.teacherId must be present in the response contract');
assert(reviewRecord?.properties?.teacherId?.oneOf?.some((entry) => entry.type === 'null'), 'ReviewRecord.teacherId must allow null for initial system PENDING');
assert(reviewRecord?.properties?.reason?.maxLength === 500, 'ReviewRecord.reason maxLength must be 500');
assert(reviewRecord?.properties?.internalNote?.maxLength === 2000, 'ReviewRecord.internalNote maxLength must be 2000');

assert(sameArray(schemas.ExerciseRecord?.['x-database-unique-key'], ['sessionId']), 'ExerciseRecord must be unique per sessionId');
assert(schemas.ExerciseRecord?.['x-same-day-independent-records'] === true, 'ExerciseRecord must permit independent same-day exercise records');
assert(schemas.ExerciseRecord?.['x-daily-credited-record-limit'] === 1, 'ExerciseRecord daily credited record limit must remain one');

const auditFields = [
  'id', 'organizationId', 'actorUserId', 'actorRoleSnapshot', 'permissionId', 'actionType', 'targetType', 'targetId',
  'requestId', 'idempotencyKeyReference', 'outcome', 'reasonCode', 'safeMetadata', 'sourceIpHash',
  'deviceFingerprintHash', 'occurredAt',
];
assert(sameArray(Object.keys(schemas.AuditLog?.properties ?? {}), auditFields), 'AuditLog properties do not match the frozen exact field list');
assert(sameArray(schemas.AuditLog?.required, auditFields), 'AuditLog required fields do not match the frozen exact field list');

const mediaFields = Object.keys(schemas.MediaEvidence?.properties ?? {});
assert(mediaFields.includes('declaredContentSha256'), 'MediaEvidence must contain declaredContentSha256');
assert(mediaFields.includes('verifiedContentSha256'), 'MediaEvidence must contain verifiedContentSha256');
assert(!mediaFields.includes('contentSha256'), 'MediaEvidence must not contain ambiguous contentSha256');
assert(schemas.MediaUploadSession?.required?.includes('mediaId'), 'Media initiate response must allocate a stable mediaId');
assert(schemas.InitiateMediaUploadRequest?.properties?.declaredContentSha256, 'Media initiate request must use declaredContentSha256');
assert(
  sameArray(schemas.MediaBusinessPurpose?.enum, [
    'EXERCISE_RECORD',
    'EXEMPTION_APPLICATION',
  ]),
  'MediaBusinessPurpose must contain only EXERCISE_RECORD and EXEMPTION_APPLICATION',
);

const issueJoin = operations.find(({ operation }) => operation.operationId === 'issueJoinCapability')?.operation;
const atomicJoin = operations.find(({ operation }) => operation.operationId === 'joinClassSectionWithInvite')?.operation;
assert(issueJoin?.['x-access-policy']?.authentication === 'PUBLIC', 'Join capability issuance must be PUBLIC');
assert(atomicJoin?.['x-access-policy']?.authentication === 'JOIN_CAPABILITY', 'Atomic Join must authenticate with JOIN_CAPABILITY');
assert(JSON.stringify(atomicJoin?.security) === JSON.stringify([{ JoinCapability: [] }]), 'Atomic Join must accept only JoinCapability security');
assert(!atomicJoin?.requestBody, 'Atomic Join profile data must come only from the bound Join Capability');
assert(sameArray(schemas.IssueJoinCapabilityRequest?.required, ['fullName', 'studentNumber', 'gender', 'gradeYear']), 'Join capability profile request fields must be exact');
assert(
  sameArray(schemas.JoinResult?.required, [
    'studentProfile',
    'enrollment',
    'course',
    'classSection',
    'authSession',
  ]),
  'JoinResult must atomically return Profile, Enrollment, Course, ClassSection, and AuthSession',
);

const defaultClosedOperations = new Map([
  ['withdrawEnrollment', 'ENROLLMENT_WITHDRAWAL_DISABLED'],
  ['ignoreRosterAlignmentResult', 'ROSTER_IGNORE_NOT_ALLOWED'],
  ['withdrawExerciseRecord', 'EXERCISE_RECORD_WITHDRAWAL_NOT_ALLOWED'],
  ['openStudentScoreCorrection', 'SCORE_CORRECTION_NOT_ALLOWED'],
  ['listExports', 'SYSTEM_MODE_UNSUPPORTED'],
  ['createExport', 'SYSTEM_MODE_UNSUPPORTED'],
  ['getExport', 'SYSTEM_MODE_UNSUPPORTED'],
  ['createExportDownloadUrl', 'SYSTEM_MODE_UNSUPPORTED'],
]);

const createCourse = operations.find(({ operation }) => operation.operationId === 'createCourse')?.operation;
const updateCourse = operations.find(({ operation }) => operation.operationId === 'updateCourse')?.operation;
assert(createCourse?.['x-access-policy']?.allowedRoles?.join(',') === 'ADMIN', 'ADR-067 requires ADMIN-only Course creation');
assert(updateCourse?.['x-access-policy']?.allowedRoles?.join(',') === 'ADMIN', 'ADR-067 requires ADMIN-only Course update');
assert(createCourse?.['x-default-deny-error'] === undefined, 'Accepted ADR-067 must not leave Course create default-closed');
assert(updateCourse?.['x-default-deny-error'] === undefined, 'Accepted ADR-067 must not leave Course update default-closed');
assert(sameArray(schemas.CourseStatus?.enum, ['ACTIVE', 'INACTIVE']), 'CourseStatus must be ACTIVE/INACTIVE');
assert(!schemas.CreateClassSectionRequest?.properties?.teacherId, 'ClassSection teacherId must be derived from the authenticated principal');
for (const [operationId, errorCode] of defaultClosedOperations) {
  const operation = operations.find((candidate) => candidate.operation.operationId === operationId)?.operation;
  assert(operation, `Default-closed operation ${operationId} is missing`);
  assert(operation?.['x-enabled-by-default'] === false, `${operationId} must set x-enabled-by-default: false`);
  assert(operation?.['x-default-deny-error'] === errorCode, `${operationId} must fail closed with ${errorCode}`);
  assert(openapiErrorCodes.includes(errorCode), `${operationId} deny error ${errorCode} is not registered`);
}
for (const operationId of ['reviewExerciseRecord', 'batchReviewExerciseRecords']) {
  const operation = operations.find((candidate) => candidate.operation.operationId === operationId)?.operation;
  assert(operation?.['x-field-deny-error'] === 'REVIEW_CREDIT_OVERRIDE_NOT_APPROVED', `${operationId} must deny credited-duration override`);
}

const errorResponse = schemas.ErrorEnvelope;
assert(sameArray(errorResponse?.required, ['code', 'message', 'details', 'requestId', 'timestamp']), 'ErrorResponse required fields must be exact');
assert(sameArray(Object.keys(errorResponse?.properties ?? {}), ['code', 'message', 'details', 'requestId', 'timestamp']), 'ErrorResponse properties must be exact');

let durationSchemaCount = 0;
walk(schemas, (value, segments) => {
  const propertyName = segments.at(-1);
  if (!propertyName?.endsWith('DurationSeconds')) return;
  durationSchemaCount += 1;
  const directTypes = Array.isArray(value.type) ? value.type : [value.type];
  const referenced = value.$ref ? resolveLocalReference(value.$ref) : undefined;
  const integer = directTypes.includes('integer') || referenced?.type === 'integer' || value.oneOf?.some((entry) => entry.type === 'integer' || resolveLocalReference(entry.$ref)?.type === 'integer');
  assert(integer, `${segments.join('.')} duration must be an integer schema`);
});

const enumValueCount = [...openapiEnums.values()].reduce((sum, values) => sum + values.length, 0);
notes.push(`OpenAPI paths: ${Object.keys(openapi.paths).length}`);
notes.push(`OpenAPI operations: ${operations.length}`);
notes.push(`OpenAPI schemas: ${Object.keys(schemas).length}`);
notes.push(`Local references checked: ${referenceCount}`);
notes.push(`Access policies: ${policiesByOperation.size}; registry rows: ${registryRows.size}; diff: ${Math.abs(policiesByOperation.size - registryRows.size)}`);
notes.push(`Named enums: ${openapiEnums.size}; values: ${enumValueCount}; diff: ${setDiff([...openapiEnums.keys()], [...documentedEnums.keys()]).length + setDiff([...documentedEnums.keys()], [...openapiEnums.keys()]).length}`);
notes.push(`Error codes: ${openapiErrorCodes.length}; diff: ${errorsOnlyInDocs.length + errorsOnlyInOpenapi.length}`);
notes.push(`Integer duration fields checked: ${durationSchemaCount}`);

if (failures.length > 0) {
  console.error(`Contract checks failed (${failures.length}):`);
  failures.forEach((message, index) => console.error(`${index + 1}. ${message}`));
  process.exit(1);
}

console.log('Deterministic Greenfield contract checks: PASS');
for (const note of notes) console.log(`- ${note}`);
