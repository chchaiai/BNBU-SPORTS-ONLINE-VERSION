import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const HTTP_METHODS = new Set([
  "delete",
  "get",
  "head",
  "options",
  "patch",
  "post",
  "put",
  "trace",
]);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..", "..");
const releaseConfig = JSON.parse(
  await readFile(path.join(scriptDirectory, "release-config.json"), "utf8"),
);
if (releaseConfig.formatVersion !== 1)
  throw new Error("Unsupported contract release config format");
const publishedHash = releaseConfig.publishedBaseline.sha256;
const defaults = {
  baseline: path.join(
    repositoryRoot,
    "docs/backend-contracts/contract-history",
    `${releaseConfig.publishedBaseline.version}-${publishedHash}`,
    "openapi.snapshot.yaml",
  ),
  current: path.join(repositoryRoot, "docs/backend-contracts/openapi.yaml"),
  allowlist: path.join(
    repositoryRoot,
    "tools/backend-contracts/breaking-change-allowlist.json",
  ),
  json: path.join(
    repositoryRoot,
    releaseConfig.compatibility.jsonPath,
  ),
  markdown: path.join(
    repositoryRoot,
    releaseConfig.compatibility.markdownPath,
  ),
  majorChangeApproval: releaseConfig.majorChangeApprovalPath
    ? path.join(repositoryRoot, releaseConfig.majorChangeApprovalPath)
    : null,
};

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort((left, right) => left.localeCompare(right, "en"))
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hash(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function localRef(document, reference) {
  if (!reference.startsWith("#/")) return { $ref: reference };
  return reference
    .slice(2)
    .split("/")
    .map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce((value, token) => value?.[token], document);
}

function resolveNode(document, node, seen = new Set()) {
  if (node === null || typeof node !== "object") return node;
  if (Array.isArray(node))
    return node.map((entry) => resolveNode(document, entry, seen));
  if (typeof node.$ref === "string") {
    if (seen.has(node.$ref)) return { $ref: node.$ref };
    return resolveNode(
      document,
      localRef(document, node.$ref),
      new Set([...seen, node.$ref]),
    );
  }
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => [
      key,
      resolveNode(document, value, seen),
    ]),
  );
}

function changeId(kind, location, before, after) {
  const digest = hash(
    `${kind}\n${location}\n${canonical(before)}\n${canonical(after)}`,
  ).slice(0, 16);
  return `${kind.toLowerCase().replaceAll("_", "-")}-${digest}`;
}

function addChange(
  changes,
  kind,
  classification,
  direction,
  location,
  before,
  after,
  detail,
) {
  changes.push({
    id: changeId(kind, location, before, after),
    kind,
    classification,
    direction,
    location,
    detail,
    before: before ?? null,
    after: after ?? null,
  });
}

function enumDifference(before = [], after = []) {
  const beforeValues = new Map(
    before.map((value) => [canonical(value), value]),
  );
  const afterValues = new Map(after.map((value) => [canonical(value), value]));
  return {
    removed: [...beforeValues]
      .filter(([key]) => !afterValues.has(key))
      .map(([, value]) => value),
    added: [...afterValues]
      .filter(([key]) => !beforeValues.has(key))
      .map(([, value]) => value),
  };
}

function structuralSchema(schema) {
  if (schema === null || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(structuralSchema);
  const ignored = new Set([
    "description",
    "example",
    "examples",
    "deprecated",
    "title",
  ]);
  return Object.fromEntries(
    Object.entries(schema)
      .filter(([key]) => !ignored.has(key))
      .map(([key, value]) => [key, structuralSchema(value)]),
  );
}

function schemaAlternatives(schema) {
  const normalized = structuralSchema(schema);
  if (Array.isArray(normalized.oneOf))
    return normalized.oneOf.map(structuralSchema);
  if (Array.isArray(normalized.anyOf))
    return normalized.anyOf.map(structuralSchema);
  if (Array.isArray(normalized.type)) {
    return normalized.type.map((type) => {
      const alternative = { ...normalized, type };
      if (type === "null") {
        delete alternative.format;
        delete alternative.pattern;
      }
      return alternative;
    });
  }
  return [normalized];
}

function compareSchema(baseline, current, direction, location, changes) {
  if (baseline === undefined && current !== undefined) {
    addChange(
      changes,
      "SCHEMA_ADDED",
      direction === "response" ? "REVIEW_REQUIRED" : "NON_BREAKING",
      direction,
      location,
      baseline,
      current,
      "A schema was added.",
    );
    return;
  }
  if (baseline !== undefined && current === undefined) {
    addChange(
      changes,
      "SCHEMA_REMOVED",
      "BREAKING",
      direction,
      location,
      baseline,
      current,
      "A schema was removed.",
    );
    return;
  }
  if (
    !baseline ||
    !current ||
    typeof baseline !== "object" ||
    typeof current !== "object"
  )
    return;
  if (canonical(baseline) === canonical(current)) return;

  const baselineAlternativeSet = new Set(
    schemaAlternatives(baseline).map(canonical),
  );
  const currentAlternativeSet = new Set(
    schemaAlternatives(current).map(canonical),
  );
  if (
    baselineAlternativeSet.size < currentAlternativeSet.size &&
    [...baselineAlternativeSet].every((alternative) =>
      currentAlternativeSet.has(alternative),
    )
  ) {
    addChange(
      changes,
      "SCHEMA_ALTERNATIVE_ADDED",
      "NON_BREAKING",
      direction,
      location,
      baseline,
      current,
      "The prior schema alternatives remain accepted and additional compatible alternatives were added.",
    );
    return;
  }

  const baselineAlternatives = baseline.oneOf ?? baseline.anyOf;
  const currentAlternatives = current.oneOf ?? current.anyOf;
  if (currentAlternatives && !baselineAlternatives) {
    const includesBaseline = currentAlternatives.some(
      (alternative) => canonical(alternative) === canonical(baseline),
    );
    addChange(
      changes,
      includesBaseline
        ? "SCHEMA_ALTERNATIVE_ADDED"
        : "SCHEMA_COMPOSITION_CHANGED",
      includesBaseline ? "NON_BREAKING" : "BREAKING",
      direction,
      location,
      baseline,
      current,
      includesBaseline
        ? "The prior schema remains an explicit alternative."
        : "oneOf/anyOf composition changed without retaining the prior schema.",
    );
    return;
  }
  if (baselineAlternatives || currentAlternatives) {
    if (canonical(baselineAlternatives) !== canonical(currentAlternatives)) {
      addChange(
        changes,
        "SCHEMA_COMPOSITION_CHANGED",
        "BREAKING",
        direction,
        location,
        baselineAlternatives,
        currentAlternatives,
        "oneOf/anyOf alternatives changed.",
      );
    }
  }
  if (canonical(baseline.discriminator) !== canonical(current.discriminator)) {
    addChange(
      changes,
      "DISCRIMINATOR_CHANGED",
      "BREAKING",
      direction,
      location,
      baseline.discriminator,
      current.discriminator,
      "The discriminator contract changed.",
    );
  }
  for (const keyword of [
    "type",
    "format",
    "pattern",
    "minimum",
    "maximum",
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
  ]) {
    if (canonical(baseline[keyword]) !== canonical(current[keyword])) {
      addChange(
        changes,
        `SCHEMA_${keyword.toUpperCase()}_CHANGED`,
        "BREAKING",
        direction,
        `${location}/${keyword}`,
        baseline[keyword],
        current[keyword],
        `${keyword} changed.`,
      );
    }
  }
  const baselineNullable =
    baseline.nullable === true || (baseline.type ?? []).includes?.("null");
  const currentNullable =
    current.nullable === true || (current.type ?? []).includes?.("null");
  if (baselineNullable && !currentNullable) {
    addChange(
      changes,
      "NULLABLE_NARROWED",
      "BREAKING",
      direction,
      location,
      true,
      false,
      "Null was removed from the accepted value set.",
    );
  }
  const enums = enumDifference(baseline.enum, current.enum);
  if (enums.removed.length > 0) {
    addChange(
      changes,
      "ENUM_VALUES_REMOVED",
      direction === "request" ? "BREAKING" : "NON_BREAKING",
      direction,
      `${location}/enum`,
      enums.removed,
      [],
      "Published enum values were removed.",
    );
  }
  if (enums.added.length > 0) {
    addChange(
      changes,
      "ENUM_VALUES_ADDED",
      direction === "response" ? "BREAKING" : "NON_BREAKING",
      direction,
      `${location}/enum`,
      [],
      enums.added,
      "Enum additions are classified according to request/response direction.",
    );
  }

  const baselineRequired = new Set(baseline.required ?? []);
  const currentRequired = new Set(current.required ?? []);
  for (const property of currentRequired) {
    if (!baselineRequired.has(property)) {
      addChange(
        changes,
        "REQUIRED_PROPERTY_ADDED",
        "BREAKING",
        direction,
        `${location}/required/${property}`,
        false,
        true,
        "A required property was added.",
      );
    }
  }
  const baselineProperties = baseline.properties ?? {};
  const currentProperties = current.properties ?? {};
  for (const property of Object.keys(baselineProperties)) {
    if (!(property in currentProperties)) {
      addChange(
        changes,
        "PROPERTY_REMOVED",
        "BREAKING",
        direction,
        `${location}/properties/${property}`,
        baselineProperties[property],
        undefined,
        "A published property was removed.",
      );
    } else {
      compareSchema(
        baselineProperties[property],
        currentProperties[property],
        direction,
        `${location}/properties/${property}`,
        changes,
      );
    }
  }
  for (const property of Object.keys(currentProperties)) {
    if (!(property in baselineProperties)) {
      const required = currentRequired.has(property);
      addChange(
        changes,
        "PROPERTY_ADDED",
        required
          ? "BREAKING"
          : direction === "response"
            ? "REVIEW_REQUIRED"
            : "NON_BREAKING",
        direction,
        `${location}/properties/${property}`,
        undefined,
        currentProperties[property],
        required
          ? "A required property was added."
          : "An optional property was added.",
      );
    }
  }
  if (baseline.items || current.items) {
    compareSchema(
      baseline.items,
      current.items,
      direction,
      `${location}/items`,
      changes,
    );
  }
}

function operations(document) {
  return new Map(
    Object.entries(document.paths ?? {}).flatMap(([apiPath, pathItem]) =>
      Object.entries(pathItem)
        .filter(([method]) => HTTP_METHODS.has(method.toLowerCase()))
        .map(([method, operation]) => [
          `${method.toUpperCase()} ${apiPath}`,
          operation,
        ]),
    ),
  );
}

function parameters(document, operation) {
  return new Map(
    (operation.parameters ?? []).map((parameterNode) => {
      const parameter = resolveNode(document, parameterNode);
      return [`${parameter.in}:${parameter.name}`, parameter];
    }),
  );
}

export function compareContracts(baselineDocument, currentDocument) {
  const changes = [];
  const baselineOperations = operations(baselineDocument);
  const currentOperations = operations(currentDocument);
  for (const [key, baselineOperation] of baselineOperations) {
    const currentOperation = currentOperations.get(key);
    if (!currentOperation) {
      addChange(
        changes,
        "OPERATION_REMOVED",
        "BREAKING",
        "operation",
        key,
        true,
        false,
        "A path or HTTP method was removed.",
      );
      continue;
    }
    for (const metadata of ["security", "x-access-policy"]) {
      const before = baselineOperation[metadata] ?? baselineDocument[metadata];
      const after = currentOperation[metadata] ?? currentDocument[metadata];
      if (canonical(before) !== canonical(after)) {
        addChange(
          changes,
          metadata === "security"
            ? "SECURITY_CHANGED"
            : "PERMISSION_METADATA_CHANGED",
          "BREAKING",
          "security",
          `${key}/${metadata}`,
          before,
          after,
          `${metadata} changed.`,
        );
      }
    }
    const baselineParameters = parameters(baselineDocument, baselineOperation);
    const currentParameters = parameters(currentDocument, currentOperation);
    for (const [parameterKey, baselineParameter] of baselineParameters) {
      const currentParameter = currentParameters.get(parameterKey);
      if (!currentParameter) {
        addChange(
          changes,
          "PARAMETER_REMOVED",
          "BREAKING",
          "request",
          `${key}/parameters/${parameterKey}`,
          baselineParameter,
          undefined,
          "A request parameter was removed.",
        );
      } else {
        compareSchema(
          resolveNode(baselineDocument, baselineParameter.schema),
          resolveNode(currentDocument, currentParameter.schema),
          "request",
          `${key}/parameters/${parameterKey}`,
          changes,
        );
      }
    }
    for (const [parameterKey, currentParameter] of currentParameters) {
      if (!baselineParameters.has(parameterKey)) {
        addChange(
          changes,
          "PARAMETER_ADDED",
          currentParameter.required ? "BREAKING" : "NON_BREAKING",
          "request",
          `${key}/parameters/${parameterKey}`,
          undefined,
          currentParameter,
          currentParameter.required
            ? "A required request parameter was added."
            : "An optional request parameter was added.",
        );
      }
    }
    const baselineBody = resolveNode(
      baselineDocument,
      baselineOperation.requestBody,
    );
    const currentBody = resolveNode(
      currentDocument,
      currentOperation.requestBody,
    );
    const mediaTypes = new Set([
      ...Object.keys(baselineBody?.content ?? {}),
      ...Object.keys(currentBody?.content ?? {}),
    ]);
    for (const mediaType of mediaTypes) {
      compareSchema(
        baselineBody?.content?.[mediaType]?.schema,
        currentBody?.content?.[mediaType]?.schema,
        "request",
        `${key}/requestBody/${mediaType}`,
        changes,
      );
    }
    const baselineResponses = baselineOperation.responses ?? {};
    const currentResponses = currentOperation.responses ?? {};
    for (const status of Object.keys(baselineResponses)) {
      if (!(status in currentResponses)) {
        addChange(
          changes,
          "RESPONSE_STATUS_REMOVED",
          "BREAKING",
          "response",
          `${key}/responses/${status}`,
          baselineResponses[status],
          undefined,
          "A documented response status was removed.",
        );
        continue;
      }
      const baselineResponse = resolveNode(
        baselineDocument,
        baselineResponses[status],
      );
      const currentResponse = resolveNode(
        currentDocument,
        currentResponses[status],
      );
      const responseMediaTypes = new Set([
        ...Object.keys(baselineResponse?.content ?? {}),
        ...Object.keys(currentResponse?.content ?? {}),
      ]);
      for (const mediaType of responseMediaTypes) {
        compareSchema(
          baselineResponse?.content?.[mediaType]?.schema,
          currentResponse?.content?.[mediaType]?.schema,
          "response",
          `${key}/responses/${status}/${mediaType}`,
          changes,
        );
      }
    }
    for (const status of Object.keys(currentResponses)) {
      if (!(status in baselineResponses)) {
        addChange(
          changes,
          "RESPONSE_STATUS_ADDED",
          "NON_BREAKING",
          "response",
          `${key}/responses/${status}`,
          undefined,
          currentResponses[status],
          "A response status was documented additively.",
        );
      }
    }
  }
  return changes.sort((left, right) => left.id.localeCompare(right.id, "en"));
}

function parseArguments(arguments_) {
  const options = { ...defaults, check: false };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--check") {
      options.check = true;
      continue;
    }
    const key = new Map([
      ["--baseline", "baseline"],
      ["--current", "current"],
      ["--allowlist", "allowlist"],
      ["--json", "json"],
      ["--markdown", "markdown"],
    ]).get(argument);
    if (!key || !arguments_[index + 1])
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    options[key] = path.resolve(repositoryRoot, arguments_[index + 1]);
    index += 1;
  }
  return options;
}

function validateException(exception) {
  for (const field of [
    "changeId",
    "reason",
    "owner",
    "approvedDate",
    "expiration",
    "migrationPlan",
    "affectedClients",
    "targetVersion",
  ]) {
    if (exception[field] === undefined || exception[field] === "")
      throw new Error(
        `Breaking exception ${exception.changeId ?? "<unknown>"} is missing ${field}`,
      );
  }
  if (
    !Array.isArray(exception.affectedClients) ||
    exception.affectedClients.length === 0
  )
    throw new Error(
      `Breaking exception ${exception.changeId} must list affected clients`,
    );
  if (Date.parse(exception.expiration) < Date.now())
    throw new Error(
      `Breaking exception ${exception.changeId} expired on ${exception.expiration}`,
    );
}

export function validateMajorChangeApproval(approval, currentVersion) {
  if (approval.formatVersion !== 1)
    throw new Error("Unsupported major change approval format");
  if (approval.targetVersion !== currentVersion)
    throw new Error(
      `Major change approval targets ${approval.targetVersion}, expected ${currentVersion}`,
    );
  for (const field of ["approvedDate", "approvalBasis", "approvedBy"])
    if (!approval[field])
      throw new Error(`Major change approval is missing ${field}`);
  if (!Number.isInteger(approval.expectedBreakingChangeCount))
    throw new Error(
      "Major change approval expectedBreakingChangeCount must be an integer",
    );
  if (!Array.isArray(approval.changeIds))
    throw new Error("Major change approval changeIds must be an array");
  if (new Set(approval.changeIds).size !== approval.changeIds.length)
    throw new Error("Major change approval contains duplicate change IDs");
  if (approval.changeIds.length !== approval.expectedBreakingChangeCount)
    throw new Error(
      `Major change approval declares ${approval.expectedBreakingChangeCount} changes but lists ${approval.changeIds.length}`,
    );
}

export function validateMajorChangeApprovalSet(approval, changes) {
  const breakingChangeIds = changes
    .filter((change) => change.classification === "BREAKING")
    .map((change) => change.id)
    .sort();
  const approvedChangeIds = new Set(approval.changeIds);
  const missing = breakingChangeIds.filter(
    (changeId) => !approvedChangeIds.has(changeId),
  );
  const extra = [...approvedChangeIds]
    .filter((changeId) => !breakingChangeIds.includes(changeId))
    .sort();
  if (
    breakingChangeIds.length !== approval.expectedBreakingChangeCount ||
    missing.length > 0 ||
    extra.length > 0
  )
    throw new Error(
      `Major change approval does not exactly match current breaking changes (actual=${breakingChangeIds.length}, expected=${approval.expectedBreakingChangeCount}, missing=${missing.length}, extra=${extra.length})`,
    );
}

function renderMarkdown(report) {
  const rows = report.changes.map(
    (change) =>
      `| ${change.id} | ${change.classification} | ${change.direction} | ${change.kind} | \`${change.location}\` | ${change.approvedException ? "YES" : "NO"} |`,
  );
  return `# OpenAPI Compatibility Report: ${report.baseline.version} to ${report.current.version}

Result: **${report.compatible ? "COMPATIBLE" : "BLOCKED"}**.

| Source | Version | SHA-256 | Operations |
| --- | --- | --- | ---: |
| Published baseline | ${report.baseline.version} | \`${report.baseline.sha256}\` | ${report.baseline.operationCount} |
| Candidate | ${report.current.version} | \`${report.current.sha256}\` | ${report.current.operationCount} |

| Classification | Count |
| --- | ---: |
| Breaking | ${report.summary.breaking} |
| Review required | ${report.summary.reviewRequired} |
| Non-breaking | ${report.summary.nonBreaking} |
| Approved exceptions | ${report.summary.approvedExceptions} |
| Unapproved blockers | ${report.summary.unapprovedBlockers} |

${
  report.majorChangeApproval
    ? `Major-version approval: **${report.majorChangeApproval.approvedChangeCount}** breaking changes approved by ${report.majorChangeApproval.approvedBy} on ${report.majorChangeApproval.approvedDate}.\n\nApproval basis: ${report.majorChangeApproval.approvalBasis}\n`
    : "Major-version approval: none.\n"
}

## Direction-aware changes

| Change ID | Classification | Direction | Kind | Location | Approved exception |
| --- | --- | --- | --- | --- | --- |
${rows.length === 0 ? "| - | - | - | - | No structural changes | - |" : rows.join("\n")}
`;
}

async function writeOrCheck(file, expected, check) {
  if (!check) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, expected, "utf8");
    return;
  }
  const actual = await readFile(file, "utf8");
  if (actual !== expected)
    throw new Error(`Generated compatibility artifact is stale: ${file}`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const [
    baselineContents,
    currentContents,
    allowlistContents,
    majorApprovalContents,
  ] = await Promise.all([
      readFile(options.baseline, "utf8"),
      readFile(options.current, "utf8"),
      readFile(options.allowlist, "utf8"),
      options.majorChangeApproval
        ? readFile(options.majorChangeApproval, "utf8")
        : Promise.resolve(null),
    ]);
  if (hash(baselineContents) !== publishedHash)
    throw new Error(
      `Published ${releaseConfig.publishedBaseline.version} snapshot hash mismatch`,
    );
  const baselineDocument = YAML.parse(baselineContents);
  const currentDocument = YAML.parse(currentContents);
  if (currentDocument.info.version !== releaseConfig.candidateVersion)
    throw new Error(
      `Candidate version must be ${releaseConfig.candidateVersion}, got ${currentDocument.info.version}`,
    );
  const allowlist = JSON.parse(allowlistContents);
  const majorChangeApproval = majorApprovalContents
    ? JSON.parse(majorApprovalContents)
    : null;
  if (majorChangeApproval)
    validateMajorChangeApproval(
      majorChangeApproval,
      currentDocument.info.version,
    );
  for (const exception of allowlist.exceptions ?? [])
    validateException(exception);
  const exceptions = new Map(
    (allowlist.exceptions ?? [])
      .filter(
        (exception) => exception.targetVersion === currentDocument.info.version,
      )
      .map((exception) => [exception.changeId, exception]),
  );
  const comparedChanges = compareContracts(baselineDocument, currentDocument);
  const approvedMajorChangeIds = new Set(majorChangeApproval?.changeIds ?? []);
  if (majorChangeApproval)
    validateMajorChangeApprovalSet(majorChangeApproval, comparedChanges);
  const changes = comparedChanges.map((change) => ({
    ...change,
    approvedException:
      exceptions.get(change.id) ??
      (approvedMajorChangeIds.has(change.id)
        ? {
            approvalType: "MAJOR_VERSION_SCOPE",
            approvedBy: majorChangeApproval.approvedBy,
            approvedDate: majorChangeApproval.approvedDate,
            approvalBasis: majorChangeApproval.approvalBasis,
            targetVersion: majorChangeApproval.targetVersion,
          }
        : null),
  }));
  const blockers = changes.filter(
    (change) =>
      ["BREAKING", "REVIEW_REQUIRED"].includes(change.classification) &&
      change.approvedException === null,
  );
  const report = {
    formatVersion: 2,
    baseline: {
      version: baselineDocument.info.version,
      sha256: hash(baselineContents),
      operationCount: operations(baselineDocument).size,
    },
    current: {
      version: currentDocument.info.version,
      sha256: hash(currentContents),
      operationCount: operations(currentDocument).size,
    },
    compatible: blockers.length === 0,
    majorChangeApproval: majorChangeApproval
      ? {
          targetVersion: majorChangeApproval.targetVersion,
          approvedBy: majorChangeApproval.approvedBy,
          approvedDate: majorChangeApproval.approvedDate,
          approvalBasis: majorChangeApproval.approvalBasis,
          approvedChangeCount: majorChangeApproval.changeIds.length,
        }
      : null,
    summary: {
      breaking: changes.filter((change) => change.classification === "BREAKING")
        .length,
      reviewRequired: changes.filter(
        (change) => change.classification === "REVIEW_REQUIRED",
      ).length,
      nonBreaking: changes.filter(
        (change) => change.classification === "NON_BREAKING",
      ).length,
      approvedExceptions: changes.filter(
        (change) => change.approvedException !== null,
      ).length,
      unapprovedBlockers: blockers.length,
    },
    changes,
  };
  await Promise.all([
    writeOrCheck(
      options.json,
      `${JSON.stringify(report, null, 2)}\n`,
      options.check,
    ),
    writeOrCheck(options.markdown, renderMarkdown(report), options.check),
  ]);
  console.log(
    `OpenAPI compatibility ${options.check ? "check" : "generation"}: ${report.compatible ? "PASS" : "FAIL"} (${changes.length} classified changes, ${blockers.length} blockers).`,
  );
  if (!report.compatible) process.exitCode = 1;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
