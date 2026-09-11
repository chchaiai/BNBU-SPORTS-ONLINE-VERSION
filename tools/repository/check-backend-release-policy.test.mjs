import assert from "node:assert/strict";
import test from "node:test";

import {
  changeBaseCandidates,
  compareContractVersions,
  isBackendReleaseScope,
  parseContractVersion,
} from "./check-backend-release-policy.mjs";

test("uses the parent commit on authoritative and mirror default branches", () => {
  assert.deepEqual(changeBaseCandidates("monorepo/main", undefined), []);
  assert.deepEqual(changeBaseCandidates("main", undefined), ["monorepo/main"]);
  assert.deepEqual(changeBaseCandidates("feature/release", undefined), [
    "monorepo/main",
    "origin/main",
  ]);
  assert.deepEqual(changeBaseCandidates("feature/release", "main"), [
    "origin/main",
    "monorepo/main",
    "origin/main",
  ]);
});

test("parses and compares contract semantic versions", () => {
  assert.deepEqual(parseContractVersion("1.6.0-contract"), [1, 6, 0]);
  assert.ok(compareContractVersions("1.6.0-contract", "1.5.9-contract") > 0);
  assert.ok(compareContractVersions("2.0.0-contract", "1.99.99-contract") > 0);
  assert.equal(compareContractVersions("1.6.0-contract", "1.6.0-contract"), 0);
  assert.throws(() => parseContractVersion("1.6"), /Invalid contract version/u);
});

test("recognizes authoritative Backend release scope", () => {
  assert.equal(isBackendReleaseScope("backend/src/main.ts"), true);
  assert.equal(isBackendReleaseScope("docs/backend-contracts/openapi.yaml"), true);
  assert.equal(
    isBackendReleaseScope("docs/backend-contracts/releases/1.6.0-contract/release-manifest.json"),
    false,
  );
  assert.equal(
    isBackendReleaseScope("backend/src/generated/openapi.document.generated.json"),
    false,
  );
  assert.equal(isBackendReleaseScope("tools/repository/check.mjs"), true);
  assert.equal(isBackendReleaseScope("BNBU-Sports-Web-new/app/page.tsx"), false);
  assert.equal(isBackendReleaseScope("AGENTS.md"), false);
});
