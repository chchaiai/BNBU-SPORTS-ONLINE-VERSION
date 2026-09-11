import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const contractPath = "docs/backend-contracts/openapi.yaml";
const releaseConfigPath = resolve(
  repositoryRoot,
  "tools/backend-contracts/release-config.json",
);
const backendScopePrefixes = [
  ".github/workflows/",
  "backend/",
  "docs/backend-contracts/",
  "tools/backend-contracts/",
  "tools/repository/",
];
const releaseMetadataPrefixes = [
  "backend/src/generated/",
  "docs/backend-contracts/contract-history/",
  "docs/backend-contracts/releases/",
];
const releaseMetadataFiles = new Set([
  "docs/backend-contracts/BACKEND-PRODUCTION-CLOSURE-INVENTORY.md",
  "docs/backend-contracts/CURRENT-HANDOFF.md",
  "docs/backend-contracts/backend-production-closure-inventory.json",
  "docs/backend-contracts/current-contract.json",
]);

export function parseContractVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)-contract$/u.exec(value);
  if (match === null) throw new Error(`Invalid contract version: ${value}`);
  return match.slice(1).map(Number);
}

export function compareContractVersions(left, right) {
  const leftParts = parseContractVersion(left);
  const rightParts = parseContractVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index])
      return leftParts[index] - rightParts[index];
  }
  return 0;
}

export function isBackendReleaseScope(path) {
  if (releaseMetadataFiles.has(path)) return false;
  if (releaseMetadataPrefixes.some((prefix) => path.startsWith(prefix)))
    return false;
  if (/^docs\/backend-contracts\/openapi-.+-compatibility\.(?:json|md)$/u.test(path))
    return false;
  return backendScopePrefixes.some((prefix) => path.startsWith(prefix));
}

function git(...arguments_) {
  return execFileSync("git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function refExists(reference) {
  try {
    git("rev-parse", "--verify", `${reference}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

function hasMergeBase(reference) {
  try {
    git("merge-base", reference, "HEAD");
    return true;
  } catch {
    return false;
  }
}

export function changeBaseCandidates(branch, githubBaseRef) {
  const isDefaultBranch = ["main", "master", "monorepo/main"].includes(branch);
  return [
    githubBaseRef === undefined ? null : `origin/${githubBaseRef}`,
    branch === "monorepo/main" ? null : "monorepo/main",
    isDefaultBranch ? null : "origin/main",
  ].filter(Boolean);
}

function changeBase() {
  const branch = git("branch", "--show-current");
  return (
    changeBaseCandidates(branch, process.env.GITHUB_BASE_REF).find(
      (reference) => refExists(reference) && hasMergeBase(reference),
    ) ?? "HEAD^"
  );
}

function currentOpenApiVersion(contents) {
  const match = /^  version:\s*(\S+)\s*$/mu.exec(contents);
  if (match === null) throw new Error("Canonical OpenAPI version is missing");
  return match[1];
}

export function checkBackendReleasePolicy() {
  const releaseConfig = JSON.parse(readFileSync(releaseConfigPath, "utf8"));
  const canonical = readFileSync(resolve(repositoryRoot, contractPath), "utf8");
  const currentVersion = currentOpenApiVersion(canonical);
  if (releaseConfig.candidateVersion !== currentVersion)
    throw new Error(
      `Release config version ${releaseConfig.candidateVersion} does not match OpenAPI ${currentVersion}`,
    );
  if (!["candidate", "published"].includes(releaseConfig.releaseState))
    throw new Error(`Invalid release state: ${releaseConfig.releaseState}`);

  const tags = git("tag", "--list", "*-contract")
    .split(/\r?\n/u)
    .filter(Boolean)
    .filter((tag) => /^\d+\.\d+\.\d+-contract$/u.test(tag))
    .sort(compareContractVersions);
  if (tags.length === 0)
    throw new Error("No reachable published contract tag exists");
  const latestPublishedVersion = tags.at(-1);
  const base = changeBase();
  const range = base === "HEAD^" ? "HEAD^..HEAD" : `${base}...HEAD`;
  const changedPaths = git("diff", "--name-only", range, "--")
    .split(/\r?\n/u)
    .filter(Boolean)
    .filter(isBackendReleaseScope);

  if (
    changedPaths.length > 0 &&
    compareContractVersions(currentVersion, latestPublishedVersion) <= 0
  ) {
    throw new Error(
      `Backend changed after ${latestPublishedVersion}, but current contract ${currentVersion} was not advanced`,
    );
  }

  if (tags.includes(currentVersion)) {
    const tagged = git("show", `${currentVersion}:${contractPath}`);
    if (sha256(`${tagged}\n`) !== sha256(canonical))
      throw new Error(
        `Published tag ${currentVersion} does not match current OpenAPI bytes`,
      );
  }

  return {
    currentVersion,
    latestPublishedVersion,
    changeBase: base,
    releaseState: releaseConfig.releaseState,
    backendChangesSincePublishedTag: changedPaths.length,
  };
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = checkBackendReleasePolicy();
    console.log(
      `Backend release policy: PASS (current=${result.currentVersion}, latestPublished=${result.latestPublishedVersion}, state=${result.releaseState}, base=${result.changeBase}, changedPaths=${result.backendChangesSincePublishedTag}).`,
    );
  } catch (error) {
    console.error(`Backend release policy: FAIL (${error.message}).`);
    process.exitCode = 1;
  }
}
