import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compareContracts,
  validateMajorChangeApproval,
  validateMajorChangeApprovalSet,
} from "./check-openapi-compatibility.mjs";

const operation = (overrides = {}) => ({
  operationId: "fixtureOperation",
  security: [{ bearerAuth: [] }],
  "x-access-policy": {
    authentication: "ACCESS_TOKEN",
    allowedRoles: ["ADMIN"],
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["status"],
            properties: { status: { type: "string", enum: ["ACTIVE"] } },
          },
        },
      },
    },
  },
  ...overrides,
});
const document = (candidateOperation) => ({
  openapi: "3.1.0",
  info: { title: "fixture", version: "1.0.0" },
  paths: { "/fixture": { get: candidateOperation } },
});

describe("direction-aware OpenAPI compatibility fixtures", () => {
  it("detects removed operations", () => {
    const changes = compareContracts(
      document(operation()),
      document(undefined),
    );
    assert.ok(changes.some((change) => change.kind === "OPERATION_REMOVED"));
  });

  it("detects required request property additions", () => {
    const request = (required) => ({
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required,
            properties: {
              name: { type: "string" },
              version: { type: "integer" },
            },
          },
        },
      },
    });
    const changes = compareContracts(
      document(operation({ requestBody: request(["name"]) })),
      document(operation({ requestBody: request(["name", "version"]) })),
    );
    assert.ok(
      changes.some((change) => change.kind === "REQUIRED_PROPERTY_ADDED"),
    );
  });

  it("classifies response enum additions as breaking", () => {
    const current = operation();
    current.responses[200].content[
      "application/json"
    ].schema.properties.status.enum.push("PAUSED");
    const changes = compareContracts(document(operation()), document(current));
    assert.ok(
      changes.some(
        (change) =>
          change.kind === "ENUM_VALUES_ADDED" &&
          change.classification === "BREAKING",
      ),
    );
  });

  it("detects response status removal", () => {
    const baseline = operation({
      responses: { ...operation().responses, 404: operation().responses[200] },
    });
    const changes = compareContracts(document(baseline), document(operation()));
    assert.ok(
      changes.some((change) => change.kind === "RESPONSE_STATUS_REMOVED"),
    );
  });

  it("detects security and permission metadata changes", () => {
    const changes = compareContracts(
      document(operation()),
      document(
        operation({
          security: [],
          "x-access-policy": { allowedRoles: ["STUDENT"] },
        }),
      ),
    );
    assert.ok(changes.some((change) => change.kind === "SECURITY_CHANGED"));
    assert.ok(
      changes.some((change) => change.kind === "PERMISSION_METADATA_CHANGED"),
    );
  });
});

describe("major-version breaking change approval", () => {
  const approval = {
    formatVersion: 1,
    targetVersion: "2.0.0-contract",
    approvedBy: "repository-owner",
    approvedDate: "2026-08-18",
    approvalBasis: "Explicitly approved test scope.",
    expectedBreakingChangeCount: 1,
    changeIds: ["breaking-a"],
  };

  it("accepts an exact, version-bound breaking change set", () => {
    assert.doesNotThrow(() =>
      validateMajorChangeApproval(approval, "2.0.0-contract"),
    );
    assert.doesNotThrow(() =>
      validateMajorChangeApprovalSet(approval, [
        { id: "breaking-a", classification: "BREAKING" },
        { id: "compatible-b", classification: "NON_BREAKING" },
      ]),
    );
  });

  it("rejects contract drift after approval", () => {
    assert.throws(
      () =>
        validateMajorChangeApprovalSet(approval, [
          { id: "breaking-b", classification: "BREAKING" },
        ]),
      /does not exactly match/,
    );
  });
});
