import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import YAML from "yaml";

const contractPath = resolve("../../docs/backend-contracts/openapi.yaml");
const write = process.argv.includes("--write");
const sortPolicy = {
  listStudents: [
    "fullName",
    "-fullName",
    "studentNumber",
    "-studentNumber",
    "createdAt",
    "-createdAt",
  ],
  listEnrollments: ["joinedAt", "-joinedAt"],
  listRosterImports: ["versionNumber", "-versionNumber"],
  listRosterEntries: ["sourceRowNumber", "-sourceRowNumber"],
  listRosterAlignmentResults: ["createdAt", "-createdAt"],
  listExerciseRecords: ["businessDate", "-businessDate"],
  listExerciseRecordReviews: ["reviewVersion", "-reviewVersion"],
  listScoreRules: null,
  listStudentScores: null,
  listScoreAdjustments: null,
  listExports: ["requestedAt", "-requestedAt"],
  listAuditLogs: ["occurredAt", "-occurredAt"],
};

function inlineSort(policy) {
  const lines = [
    "        - name: sort",
    "          in: query",
    "          schema: { type: string, maxLength: 200 }",
  ];
  if (policy === null) {
    lines.splice(
      2,
      0,
      "          deprecated: true",
      "          x-runtime-unsupported: true",
    );
    lines.push(
      "          description: Compatibility-only Contract 1.3 field; V1 applies a fixed deterministic order and rejects no request solely for this field.",
    );
  } else {
    lines.splice(2, 0, `          x-runtime-enum: [${policy.join(", ")}]`);
    lines.push(
      "          description: Open Contract 1.3 string retained for input compatibility; runtime accepts only x-runtime-enum values.",
    );
  }
  return lines;
}

function transform(contents) {
  const lines = contents.split(/\r?\n/u);
  for (const [operationId, policy] of Object.entries(sortPolicy)) {
    const start = lines.findIndex(
      (line) => line === `      operationId: ${operationId}`,
    );
    if (start < 0) throw new Error(`Operation not found: ${operationId}`);
    const end = lines.findIndex(
      (line, index) => index > start && /^      operationId: /u.test(line),
    );
    const boundary = end < 0 ? lines.length : end;
    const sort = lines.findIndex(
      (line, index) =>
        index > start &&
        index < boundary &&
        line === "        - $ref: '#/components/parameters/Sort'",
    );
    if (sort >= 0) {
      lines.splice(sort, 1, ...inlineSort(policy));
    } else {
      const inline = lines.findIndex(
        (line, index) =>
          index > start && index < boundary && line === "        - name: sort",
      );
      const schema = lines.findIndex(
        (line, index) =>
          index > inline &&
          index < inline + 8 &&
          line.trimStart().startsWith("schema:"),
      );
      if (schema >= 0)
        lines[schema] = "          schema: { type: string, maxLength: 200 }";
    }
  }
  return `${lines.join("\n").replace(/\n+$/u, "")}\n`;
}

function verify(contents) {
  const document = YAML.parse(contents);
  const operations = Object.values(document.paths).flatMap((pathItem) =>
    Object.values(pathItem).filter((operation) => operation?.operationId),
  );
  for (const [operationId, policy] of Object.entries(sortPolicy)) {
    const operation = operations.find(
      (candidate) => candidate.operationId === operationId,
    );
    const sort = operation?.parameters?.find(
      (parameter) => parameter.name === "sort",
    );
    if (!sort) throw new Error(`${operationId}.sort is not endpoint-specific`);
    if (policy === null) {
      if (sort["x-runtime-unsupported"] !== true || sort.deprecated !== true) {
        throw new Error(
          `${operationId}.sort lacks explicit compatibility-only metadata`,
        );
      }
    } else if (
      JSON.stringify(sort["x-runtime-enum"]) !== JSON.stringify(policy)
    ) {
      throw new Error(`${operationId}.sort runtime vocabulary is stale`);
    }
  }
  const classSections = operations.find(
    (operation) => operation.operationId === "listClassSections",
  );
  const status = classSections.parameters.find(
    (parameter) => parameter.name === "status",
  );
  if (
    JSON.stringify(status["x-runtime-enum"]) !==
    JSON.stringify(["UPCOMING", "ACTIVE", "CLOSED", "ARCHIVED"])
  ) {
    throw new Error("listClassSections.status runtime vocabulary is stale");
  }
  const capture =
    document.components.schemas.InitiateMediaUploadRequest.properties
      .captureSource;
  if (
    JSON.stringify(capture["x-runtime-enum"]) !==
    JSON.stringify(["IN_APP_CAMERA", "FILE_PICKER"])
  ) {
    throw new Error(
      "initiateMediaUpload.captureSource runtime vocabulary is stale",
    );
  }
  const purpose =
    document.components.schemas.MediaAccessRequest.properties.purpose;
  if (
    JSON.stringify(purpose["x-runtime-enum"]) !==
    JSON.stringify(["VIEW_ORIGINAL"])
  ) {
    throw new Error("createMediaAccessUrl.purpose runtime vocabulary is stale");
  }
}

const actual = readFileSync(contractPath, "utf8");
if (write) writeFileSync(contractPath, transform(actual));
verify(readFileSync(contractPath, "utf8"));
console.log(
  `Contract errata metadata ${write ? "updated" : "verified"}: 16/16 decisions represented.`,
);
