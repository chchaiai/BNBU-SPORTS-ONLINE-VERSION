import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { parse } from 'yaml';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(backendRoot, '..');
const sourceRoot = resolve(backendRoot, 'src');
const contractPath = resolve(repositoryRoot, 'docs/backend-contracts/openapi.yaml');
const errorCatalogPath = resolve(repositoryRoot, 'docs/backend-contracts/07-enums-and-errors.md');

const KNOWN_CONTRACT_DEFECTS = new Map();
const KNOWN_SEMANTIC_CONTRACT_DEFECTS = [];

function walk(directory, predicate, output = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'generated') walk(absolute, predicate, output);
    } else if (predicate(absolute)) {
      output.push(absolute);
    }
  }
  return output;
}

function decorators(node) {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function decoratorInfo(decorator) {
  const expression = decorator.expression;
  const call = ts.isCallExpression(expression) ? expression : undefined;
  const target = call?.expression ?? expression;
  const name = ts.isIdentifier(target)
    ? target.text
    : ts.isPropertyAccessExpression(target)
      ? target.name.text
      : target.getText();
  return { name, args: call?.arguments ?? [] };
}

function findDecorator(node, name) {
  return decorators(node)
    .map((decorator) => decoratorInfo(decorator))
    .find((item) => item.name === name);
}

function unwrap(expression) {
  if (
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isParenthesizedExpression(expression)
  ) {
    return unwrap(expression.expression);
  }
  return expression;
}

function classNameFromType(typeNode) {
  if (typeNode === undefined) return undefined;
  if (ts.isTypeReferenceNode(typeNode)) return typeNode.typeName.getText();
  if (ts.isArrayTypeNode(typeNode)) return classNameFromType(typeNode.elementType);
  if (ts.isUnionTypeNode(typeNode)) {
    for (const member of typeNode.types) {
      const name = classNameFromType(member);
      if (name !== undefined) return name;
    }
  }
  return undefined;
}

function exposeName(property) {
  const expose = findDecorator(property, 'Expose');
  const argument = expose?.args[0];
  if (argument === undefined || !ts.isObjectLiteralExpression(argument)) return undefined;
  const nameProperty = argument.properties.find(
    (item) =>
      ts.isPropertyAssignment(item) &&
      ((ts.isIdentifier(item.name) && item.name.text === 'name') ||
        (ts.isStringLiteralLike(item.name) && item.name.text === 'name')),
  );
  if (
    nameProperty !== undefined &&
    ts.isPropertyAssignment(nameProperty) &&
    ts.isStringLiteralLike(nameProperty.initializer)
  ) {
    return nameProperty.initializer.text;
  }
  return undefined;
}

function typeDecoratorClass(property) {
  const typeDecorator = findDecorator(property, 'Type');
  const argument = typeDecorator?.args[0];
  if (argument === undefined || !ts.isArrowFunction(argument)) return undefined;
  const body = argument.body;
  return ts.isIdentifier(body) ? body.text : undefined;
}

function findingKey(finding) {
  return [finding.operationId, finding.kind, finding.field ?? '', finding.issue].join('|');
}

export function compareFieldSets(operationId, kind, contractFields, dtoFields) {
  const findings = [];
  for (const [name, contract] of contractFields) {
    const dto = dtoFields.get(name);
    if (dto === undefined) {
      if (contract.runtimeUnsupported === true) continue;
      findings.push({ operationId, kind, field: name, issue: 'CONTRACT_ONLY_FIELD', contract });
      continue;
    }
    const keys = kind === 'body' ? ['required', 'type', 'nullable'] : ['required', 'type'];
    for (const key of keys) {
      if (contract[key] !== undefined && dto[key] !== undefined && contract[key] !== dto[key]) {
        findings.push({
          operationId,
          kind,
          field: name,
          issue: `${key.toUpperCase()}_MISMATCH`,
          contract: contract[key],
          backend: dto[key],
          location: dto.location,
        });
      }
    }
    if (contract.enum !== undefined || dto.enum !== undefined) {
      const contractEnum = contract.enum === undefined ? undefined : [...contract.enum].sort();
      const dtoEnum = dto.enum === undefined ? undefined : [...dto.enum].sort();
      if (JSON.stringify(contractEnum) !== JSON.stringify(dtoEnum)) {
        findings.push({
          operationId,
          kind,
          field: name,
          issue: 'ENUM_MISMATCH',
          contract: contractEnum ?? 'OPEN_STRING',
          backend: dtoEnum ?? 'OPEN_STRING',
          location: dto.location,
        });
      }
    }
  }
  for (const [name, dto] of dtoFields) {
    if (!contractFields.has(name)) {
      findings.push({
        operationId,
        kind,
        field: name,
        issue: 'BACKEND_ONLY_FIELD',
        backend: dto,
        location: dto.location,
      });
    }
  }
  return findings;
}

export function compareSuccessStatus(operationId, contractStatus, backendStatus) {
  return contractStatus === backendStatus
    ? []
    : [
        {
          operationId,
          kind: 'successStatus',
          issue: 'SUCCESS_STATUS_MISMATCH',
          contract: contractStatus,
          backend: backendStatus,
        },
      ];
}

export function compareErrorCalls(catalog, calls) {
  const findings = [];
  const observed = new Map();
  for (const call of calls) {
    if (call.code === undefined || call.status === undefined) {
      if (!call.canonicalLookup) {
        findings.push({ kind: 'errorStatus', issue: 'DYNAMIC_ERROR_STATUS', ...call });
      }
      continue;
    }
    const expected = catalog.get(call.code);
    if (expected === undefined) {
      findings.push({ kind: 'errorStatus', issue: 'UNKNOWN_ERROR_CODE', ...call });
      continue;
    }
    if (expected !== call.status) {
      findings.push({ kind: 'errorStatus', issue: 'ERROR_STATUS_MISMATCH', expected, ...call });
    }
    const statuses = observed.get(call.code) ?? new Set();
    statuses.add(call.status);
    observed.set(call.code, statuses);
  }
  for (const [code, statuses] of observed) {
    if (statuses.size > 1) {
      findings.push({
        kind: 'errorStatus',
        issue: 'ERROR_CODE_MULTIPLE_STATUSES',
        code,
        statuses: [...statuses].sort(),
      });
    }
  }
  return findings;
}

function runSelfTest() {
  const base = { required: false, type: 'string', nullable: false };
  const rename = compareFieldSets(
    'fixtureRename',
    'query',
    new Map([['q', base]]),
    new Map([['search', base]]),
  );
  assert.deepEqual(rename.map((finding) => finding.issue).sort(), [
    'BACKEND_ONLY_FIELD',
    'CONTRACT_ONLY_FIELD',
  ]);

  const extraMissing = compareFieldSets(
    'fixtureExtraMissing',
    'body',
    new Map([['contractOnly', base]]),
    new Map([['backendOnly', base]]),
  );
  assert.equal(extraMissing.length, 2);

  const enumFinding = compareFieldSets(
    'fixtureEnum',
    'body',
    new Map([['state', { ...base, enum: ['A', 'B'] }]]),
    new Map([['state', { ...base, enum: ['A', 'C'] }]]),
  );
  assert.equal(enumFinding[0]?.issue, 'ENUM_MISMATCH');

  const requiredFinding = compareFieldSets(
    'fixtureRequired',
    'body',
    new Map([['value', { ...base, required: true }]]),
    new Map([['value', base]]),
  );
  assert.equal(requiredFinding[0]?.issue, 'REQUIRED_MISMATCH');

  assert.equal(
    compareSuccessStatus('fixtureStatus', 200, 201)[0]?.issue,
    'SUCCESS_STATUS_MISMATCH',
  );

  const errorFindings = compareErrorCalls(new Map([['FIXTURE_ERROR', 409]]), [
    { code: 'FIXTURE_ERROR', status: 409 },
    { code: 'FIXTURE_ERROR', status: 422 },
  ]);
  assert.deepEqual(errorFindings.map((finding) => finding.issue).sort(), [
    'ERROR_CODE_MULTIPLE_STATUSES',
    'ERROR_STATUS_MISMATCH',
  ]);
  console.log('Contract parity fixture tests: PASS (6 scenarios)');
}

function loadErrorCatalog() {
  const markdown = readFileSync(errorCatalogPath, 'utf8');
  const section = markdown.split(/^## 8\. /m)[1]?.split(/^## 9\. /m)[0] ?? '';
  return new Map(
    [...section.matchAll(/^\| `([A-Z][A-Z0-9_]*)` \| (\d{3}) \|/gm)].map((match) => [
      match[1],
      Number(match[2]),
    ]),
  );
}

function inspectRepository() {
  const document = parse(readFileSync(contractPath, 'utf8'));
  const sourceFiles = walk(sourceRoot, (file) => file.endsWith('.ts'));
  const program = ts.createProgram(sourceFiles, {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    experimentalDecorators: true,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const normalizedSourceRoot = sourceRoot.replaceAll('\\', '/').toLowerCase();

  function localSource(sourceFile) {
    return sourceFile.fileName.replaceAll('\\', '/').toLowerCase().startsWith(normalizedSourceRoot);
  }

  function location(sourceFile, node) {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    return `${relative(repositoryRoot, sourceFile.fileName).replaceAll('\\', '/')}:${String(line)}`;
  }

  function stringArray(expression, seen = new Set()) {
    const value = unwrap(expression);
    if (ts.isArrayLiteralExpression(value)) {
      const items = value.elements.map((element) => {
        const current = unwrap(element);
        return ts.isStringLiteralLike(current) ? current.text : undefined;
      });
      return items.every((item) => item !== undefined) ? items : undefined;
    }
    if (ts.isIdentifier(value) || ts.isPropertyAccessExpression(value)) {
      let symbol = checker.getSymbolAtLocation(value);
      if (symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0) {
        symbol = checker.getAliasedSymbol(symbol);
      }
      if (symbol === undefined || seen.has(symbol)) return undefined;
      seen.add(symbol);
      for (const declaration of symbol.declarations ?? []) {
        if (ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined) {
          const result = stringArray(declaration.initializer, seen);
          if (result !== undefined) return result;
        }
        if (ts.isEnumDeclaration(declaration)) {
          const result = declaration.members.map((member) =>
            member.initializer !== undefined && ts.isStringLiteralLike(member.initializer)
              ? member.initializer.text
              : undefined,
          );
          if (result.every((item) => item !== undefined)) return result;
        }
      }
    }
    return undefined;
  }

  const classes = new Map();
  for (const sourceFile of program.getSourceFiles().filter(localSource)) {
    ts.forEachChild(sourceFile, (node) => {
      if (!ts.isClassDeclaration(node) || node.name === undefined) return;
      const base = node.heritageClauses
        ?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)
        ?.types.at(0)
        ?.expression.getText();
      classes.set(node.name.text, { node, base, sourceFile });
    });
  }

  function propertyType(property) {
    const names = new Set(decorators(property).map((item) => decoratorInfo(item).name));
    const text = property.type?.getText() ?? '';
    if (
      names.has('IsArray') ||
      (property.type !== undefined && ts.isArrayTypeNode(property.type))
    ) {
      return 'array';
    }
    if (names.has('IsObject') || names.has('ValidateNested') || /\bRecord\s*</.test(text)) {
      return 'object';
    }
    if (names.has('IsInt')) return 'integer';
    if (names.has('IsNumber')) return 'number';
    if (names.has('IsBoolean')) return 'boolean';
    if (
      [
        'IsString',
        'IsUUID',
        'IsIn',
        'IsEnum',
        'Matches',
        'IsDateString',
        'IsISO8601',
        'IsRFC3339',
        'IsEmail',
        'IsPhoneNumber',
      ].some((name) => names.has(name))
    ) {
      return 'string';
    }
    if (/\bboolean\b/.test(text)) return 'boolean';
    if (/\bnumber\b/.test(text)) return 'number';
    if (/\bstring\b/.test(text)) return 'string';
    return 'object';
  }

  function propertyEnum(property) {
    const exact = findDecorator(property, 'Equals')?.args[0];
    if (exact?.kind === ts.SyntaxKind.TrueKeyword) return [true];
    if (exact?.kind === ts.SyntaxKind.FalseKeyword) return [false];

    for (const name of ['IsIn', 'IsEnum']) {
      const info = findDecorator(property, name);
      if (info?.args[0] !== undefined) {
        const values = stringArray(info.args[0]);
        if (values !== undefined) return values;
      }
    }
    const type = checker.getTypeAtLocation(property);
    const members = type.isUnion() ? type.types : [type];
    const values = members
      .filter((member) => (member.flags & (ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral)) !== 0)
      .map((member) => member.value);
    return values.length > 0 ? [...new Set(values)] : undefined;
  }

  function dtoProperties(name, seen = new Set()) {
    if (name === undefined || seen.has(name)) return new Map();
    seen.add(name);
    const definition = classes.get(name);
    if (definition === undefined) return new Map();
    const result = dtoProperties(definition.base, seen);
    for (const member of definition.node.members) {
      if (!ts.isPropertyDeclaration(member) || member.name === undefined) continue;
      const sourceName =
        ts.isIdentifier(member.name) || ts.isStringLiteralLike(member.name)
          ? member.name.text
          : member.name.getText();
      const apiName = exposeName(member) ?? sourceName;
      const names = new Set(decorators(member).map((item) => decoratorInfo(item).name));
      const typeText = member.type?.getText() ?? '';
      result.set(apiName, {
        name: apiName,
        required:
          member.questionToken === undefined &&
          !names.has('IsOptional') &&
          member.initializer === undefined,
        type: propertyType(member),
        nullable: names.has('IsOptional') || /(^|\W)null(\W|$)/.test(typeText),
        enum: propertyEnum(member),
        nestedDto: typeDecoratorClass(member) ?? classNameFromType(member.type),
        location: location(definition.sourceFile, member),
      });
    }
    return result;
  }

  const handlers = new Map();
  for (const definition of classes.values()) {
    for (const member of definition.node.members) {
      if (!ts.isMethodDeclaration(member)) continue;
      const policy = findDecorator(member, 'OperationPolicy');
      const operationId =
        policy?.args[0] !== undefined && ts.isStringLiteralLike(policy.args[0])
          ? policy.args[0].text
          : undefined;
      if (operationId === undefined) continue;
      let queryDto;
      let bodyDto;
      for (const parameter of member.parameters) {
        if (findDecorator(parameter, 'Query') !== undefined) {
          queryDto = classNameFromType(parameter.type);
        }
        if (findDecorator(parameter, 'Body') !== undefined) {
          bodyDto = classNameFromType(parameter.type);
        }
      }
      const httpCode = findDecorator(member, 'HttpCode');
      let status =
        httpCode?.args[0] !== undefined && ts.isNumericLiteral(httpCode.args[0])
          ? Number(httpCode.args[0].text)
          : undefined;
      const methodDecorator = ['Get', 'Post', 'Put', 'Patch', 'Delete'].find(
        (name) => findDecorator(member, name) !== undefined,
      );
      status ??= methodDecorator === 'Post' ? 201 : 200;
      handlers.set(operationId, {
        queryDto,
        bodyDto,
        status,
        location: location(definition.sourceFile, member),
      });
    }
  }

  function resolveReference(value) {
    if (value === undefined || value === null || typeof value !== 'object' || !('$ref' in value)) {
      return value;
    }
    const target = value.$ref
      .slice(2)
      .split('/')
      .reduce(
        (current, segment) => current?.[segment.replaceAll('~1', '/').replaceAll('~0', '~')],
        document,
      );
    return {
      ...resolveReference(target),
      ...Object.fromEntries(Object.entries(value).filter(([key]) => key !== '$ref')),
    };
  }

  function flattenSchema(schema) {
    const current = resolveReference(schema) ?? {};
    const result = {
      ...current,
      properties: { ...(current.properties ?? {}) },
      required: [...(current.required ?? [])],
    };
    for (const nested of current.allOf ?? []) {
      const flat = flattenSchema(nested);
      Object.assign(result.properties, flat.properties ?? {});
      result.required.push(...(flat.required ?? []));
    }
    result.required = [...new Set(result.required)];
    return result;
  }

  function schemaShape(schema) {
    const current = resolveReference(schema) ?? {};
    const variants = current.oneOf ?? current.anyOf;
    if (variants !== undefined) {
      const resolved = variants.map(resolveReference);
      const nonNull = resolved.find((entry) => entry?.type !== 'null') ?? {};
      return {
        ...schemaShape(nonNull),
        nullable: resolved.some((entry) => entry?.type === 'null'),
      };
    }
    const types = Array.isArray(current.type) ? current.type : [current.type];
    let type = types.find((value) => value !== undefined && value !== 'null');
    if (type === undefined && (current.properties !== undefined || current.allOf !== undefined)) {
      type = 'object';
    }
    return {
      type: type === 'integer' ? 'integer' : type,
      nullable: types.includes('null'),
      enum: current['x-runtime-enum'] ?? current.enum ??
        (type === 'array' && current.items ? schemaShape(current.items).enum : undefined),
      runtimeUnsupported: current['x-runtime-unsupported'] === true,
      schema: current,
    };
  }

  // Guard the real schema extraction path: array item enums must match, and differences must still fail.
  const arrayContract = schemaShape({ type: 'array', items: { type: 'string', enum: ['A', 'B'] } });
  const arrayDto = { type: 'array', nullable: false, enum: ['B', 'A'] };
  assert.deepEqual(compareFieldSets('arrayEnumRegression', 'body',
    new Map([['permissions', arrayContract]]), new Map([['permissions', arrayDto]])), []);
  assert.equal(compareFieldSets('arrayEnumRegression', 'body',
    new Map([['permissions', arrayContract]]), new Map([['permissions', { ...arrayDto, enum: ['A', 'C'] }]]))[0]?.issue, 'ENUM_MISMATCH');

  const findings = [];

  function compareSchemaToDto(operationId, kind, schema, dtoName, prefix = '') {
    const flat = flattenSchema(schema);
    const required = new Set(flat.required ?? []);
    const contractFields = new Map(
      Object.entries(flat.properties ?? {}).map(([name, propertySchema]) => [
        `${prefix}${name}`,
        { required: required.has(name), ...schemaShape(propertySchema) },
      ]),
    );
    const directDtoFields = dtoProperties(dtoName);
    const dtoFields = new Map(
      [...directDtoFields].map(([name, value]) => [`${prefix}${name}`, value]),
    );
    findings.push(...compareFieldSets(operationId, kind, contractFields, dtoFields));

    for (const [name, contract] of contractFields) {
      const directName = name.slice(prefix.length);
      const dto = directDtoFields.get(directName);
      if (dto?.nestedDto === undefined) continue;
      const current = resolveReference(contract.schema);
      const nestedSchema = current?.type === 'array' ? current.items : current;
      const nestedShape = schemaShape(nestedSchema);
      if (nestedShape.type === 'object') {
        compareSchemaToDto(operationId, kind, nestedSchema, dto.nestedDto, `${name}.`);
      }
    }
  }

  const operations = [];
  for (const [route, pathItem] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      operations.push({ route, method, operation, pathItem });
    }
  }

  const coverage = {
    operations: operations.length,
    handlers: handlers.size,
    queryOperations: 0,
    bodyOperations: 0,
  };

  for (const { operation, pathItem } of operations) {
    const operationId = operation.operationId;
    const handler = handlers.get(operationId);
    if (handler === undefined) {
      findings.push({ operationId, kind: 'handler', issue: 'MISSING_HANDLER' });
      continue;
    }
    const parameters = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]
      .map(resolveReference)
      .filter((parameter) => parameter.in === 'query');
    if (parameters.length > 0 || handler.queryDto !== undefined) {
      coverage.queryOperations += 1;
      const contractFields = new Map(
        parameters.map((parameter) => [
          parameter.name,
          {
            required: parameter.required === true,
            ...schemaShape(parameter.schema),
            enum: parameter['x-runtime-enum'] ?? schemaShape(parameter.schema).enum,
            runtimeUnsupported: parameter['x-runtime-unsupported'] === true,
          },
        ]),
      );
      findings.push(
        ...compareFieldSets(operationId, 'query', contractFields, dtoProperties(handler.queryDto)),
      );
    }

    const requestBody = resolveReference(operation.requestBody);
    const jsonSchema = requestBody?.content?.['application/json']?.schema;
    if (jsonSchema !== undefined || handler.bodyDto !== undefined) {
      coverage.bodyOperations += 1;
      if (jsonSchema === undefined || handler.bodyDto === undefined) {
        findings.push({
          operationId,
          kind: 'body',
          issue:
            jsonSchema === undefined
              ? 'BACKEND_BODY_WITHOUT_JSON_CONTRACT'
              : 'JSON_CONTRACT_WITHOUT_BODY_DTO',
        });
      } else {
        compareSchemaToDto(operationId, 'body', jsonSchema, handler.bodyDto);
      }
    }

    const successStatuses = Object.keys(operation.responses ?? {})
      .filter((status) => /^2\d\d$/.test(status))
      .map(Number);
    if (successStatuses.length === 1) {
      findings.push(
        ...compareSuccessStatus(operationId, successStatuses[0], handler.status).map((finding) => ({
          ...finding,
          location: handler.location,
        })),
      );
    }
  }

  const errorCatalog = loadErrorCatalog();
  const registry = new Map();
  const messageCodes = new Set();
  const reservedErrorCodes = new Set();
  const errorCalls = [];

  for (const sourceFile of program.getSourceFiles().filter(localSource)) {
    function visit(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        if (
          node.name.text === 'ERROR_CODES_BY_HTTP_STATUS' &&
          node.initializer !== undefined &&
          ts.isAsExpression(node.initializer) &&
          ts.isObjectLiteralExpression(node.initializer.expression)
        ) {
          for (const property of node.initializer.expression.properties) {
            if (!ts.isPropertyAssignment(property)) continue;
            const statusText =
              ts.isStringLiteralLike(property.name) || ts.isNumericLiteral(property.name)
                ? property.name.text
                : undefined;
            if (statusText === undefined) continue;
            const values = stringArray(property.initializer) ?? [];
            for (const code of values) registry.set(code, Number(statusText));
          }
        }
        if (
          node.name.text === 'ERROR_MESSAGES' &&
          node.initializer !== undefined &&
          ts.isAsExpression(node.initializer) &&
          ts.isObjectLiteralExpression(node.initializer.expression)
        ) {
          for (const property of node.initializer.expression.properties) {
            if (!ts.isPropertyAssignment(property)) continue;
            if (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)) {
              messageCodes.add(property.name.text);
            }
          }
        }
        if (node.name.text === 'RESERVED_ERROR_CODES' && node.initializer !== undefined) {
          for (const code of stringArray(node.initializer) ?? []) reservedErrorCodes.add(code);
        }
      }
      if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'ApplicationError'
      ) {
        const [codeArgument, statusArgument] = node.arguments ?? [];
        errorCalls.push({
          code:
            codeArgument !== undefined && ts.isStringLiteralLike(codeArgument)
              ? codeArgument.text
              : undefined,
          status:
            statusArgument !== undefined && ts.isNumericLiteral(statusArgument)
              ? Number(statusArgument.text)
              : undefined,
          canonicalLookup:
            statusArgument?.getText().includes('ERROR_HTTP_STATUS[') === true &&
            codeArgument?.getText() === 'snapshot.code',
          location: location(sourceFile, node),
        });
      }
      ts.forEachChild(node, visit);
    }
    ts.forEachChild(sourceFile, visit);
  }

  for (const [code, status] of errorCatalog) {
    if (!registry.has(code)) {
      findings.push({ kind: 'errorRegistry', field: code, issue: 'REGISTRY_MISSING_CODE' });
    } else if (registry.get(code) !== status) {
      findings.push({
        kind: 'errorRegistry',
        field: code,
        issue: 'REGISTRY_STATUS_MISMATCH',
        contract: status,
        backend: registry.get(code),
      });
    }
    if (!messageCodes.has(code)) {
      findings.push({ kind: 'errorRegistry', field: code, issue: 'ERROR_MESSAGE_MISSING_CODE' });
    }
  }
  for (const code of registry.keys()) {
    if (!errorCatalog.has(code)) {
      findings.push({ kind: 'errorRegistry', field: code, issue: 'REGISTRY_EXTRA_CODE' });
    }
  }
  for (const code of messageCodes) {
    if (!errorCatalog.has(code)) {
      findings.push({ kind: 'errorRegistry', field: code, issue: 'ERROR_MESSAGE_EXTRA_CODE' });
    }
  }
  for (const code of reservedErrorCodes) {
    if (!errorCatalog.has(code)) {
      findings.push({ kind: 'errorLifecycle', field: code, issue: 'RESERVED_CODE_UNKNOWN' });
    }
  }
  for (const call of errorCalls) {
    if (call.code !== undefined && reservedErrorCodes.has(call.code)) {
      findings.push({
        kind: 'errorLifecycle',
        field: call.code,
        issue: 'RESERVED_CODE_HAS_RUNTIME_CALL',
        location: call.location,
      });
    }
  }
  findings.push(...compareErrorCalls(errorCatalog, errorCalls));

  const approved = [];
  const unexpected = [];
  const matchedExceptions = new Set();
  for (const finding of findings) {
    const key = findingKey(finding);
    const exception = KNOWN_CONTRACT_DEFECTS.get(key);
    if (exception === undefined) {
      unexpected.push(finding);
    } else {
      approved.push({ ...finding, ...exception });
      matchedExceptions.add(key);
    }
  }
  for (const [key, exception] of KNOWN_CONTRACT_DEFECTS) {
    if (!matchedExceptions.has(key)) {
      unexpected.push({
        kind: 'exception',
        issue: 'STALE_CONTRACT_DEFECT_EXCEPTION',
        key,
        ...exception,
      });
    }
  }

  return {
    pass: unexpected.length === 0,
    coverage,
    errorCatalogCount: errorCatalog.size,
    errorRegistryCount: registry.size,
    errorMessageCount: messageCodes.size,
    errorCallCount: errorCalls.length,
    errorRuntimeLifecycleCount: errorCatalog.size - reservedErrorCodes.size,
    errorReservedLifecycleCount: reservedErrorCodes.size,
    approvedContractDefects: approved,
    semanticContractDefects: KNOWN_SEMANTIC_CONTRACT_DEFECTS,
    unexpected,
  };
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
} else {
  const result = inspectRepository();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `Contract parity: ${result.pass ? 'PASS' : 'FAIL'} ` +
        `(operations=${String(result.coverage.operations)}, handlers=${String(result.coverage.handlers)}, ` +
        `query=${String(result.coverage.queryOperations)}, body=${String(result.coverage.bodyOperations)})`,
    );
    console.log(
      `Error parity: catalog=${String(result.errorCatalogCount)}, registry=${String(result.errorRegistryCount)}, ` +
        `messages=${String(result.errorMessageCount)}, callSites=${String(result.errorCallCount)}, ` +
        `lifecycle=runtime:${String(result.errorRuntimeLifecycleCount)}/reserved:${String(result.errorReservedLifecycleCount)}`,
    );
    console.log(
      `Frozen 1.3 contract defects: ${String(
        result.approvedContractDefects.length + result.semanticContractDefects.length,
      )} (staticExceptions=${String(result.approvedContractDefects.length)}, ` +
        `semanticLimitations=${String(result.semanticContractDefects.length)})`,
    );
    if (result.unexpected.length > 0) {
      console.error(JSON.stringify(result.unexpected, null, 2));
    }
  }
  if (!result.pass) process.exitCode = 1;
}
