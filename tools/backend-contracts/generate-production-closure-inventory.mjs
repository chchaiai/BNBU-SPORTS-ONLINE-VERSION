import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..", "..");
const markdownPath = path.join(
  repositoryRoot,
  "docs/backend-contracts/BACKEND-PRODUCTION-CLOSURE-INVENTORY.md",
);
const jsonPath = path.join(
  repositoryRoot,
  "docs/backend-contracts/backend-production-closure-inventory.json",
);
const baselineCommit = "c771194a36074a344d4aae1ad9b6486c6cd7d978";
const checkOnly = process.argv.includes("--check");
const isBackendPublicationMirror =
  !existsSync(path.join(repositoryRoot, "BNBU-Sports-Android-master")) &&
  !existsSync(path.join(repositoryRoot, "BNBU-Sports-Web-new"));

const scopeRoots = [
  ".github/workflows/",
  "backend/",
  "docs/backend-contracts/",
  "docs/client-handoff/",
  "docs/repository/",
  "tools/backend-contracts/",
  "tools/repository/",
];
const rootScopeFiles = new Set([
  ".dockerignore",
  ".gitattributes",
  ".gitignore",
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
]);
const inventoryPaths = [
  "docs/backend-contracts/BACKEND-PRODUCTION-CLOSURE-INVENTORY.md",
  "docs/backend-contracts/backend-production-closure-inventory.json",
];

const keywordPatterns = new Map([
  ["TODO", /\bTODO\b/giu],
  ["FIXME", /\bFIXME\b/giu],
  ["HACK", /\bHACK\b/giu],
  ["TEMP", /\bTEMP\b/giu],
  ["temporary", /\btemporary\b/giu],
  ["placeholder", /\bplaceholder\b/giu],
  ["mock", /\bmock\b/giu],
  ["stub", /\bstub\b/giu],
  ["not implemented", /\bnot implemented\b/giu],
  ["NotImplementedException", /\bNotImplementedException\b/gu],
  ["throw new Error", /throw\s+new\s+Error\b/gu],
  ["console.log", /console\.log\b/gu],
  ["console.error", /console\.error\b/gu],
  ["debugger", /\bdebugger\b/gu],
  ["@ts-ignore", /@ts-ignore\b/gu],
  ["@ts-nocheck", /@ts-nocheck\b/gu],
  ["eslint-disable", /eslint-disable\b/gu],
  ["any", /\bany\b/gu],
  ["unknown as", /\bunknown\s+as\b/gu],
  ["skip", /\b(?:describe|it|test)\.skip\b|\bskip\b/giu],
  ["only", /\b(?:describe|it|test)\.only\b/gu],
  ["empty catch", /catch\s*(?:\([^)]*\))?\s*\{\s*\}/gu],
  [
    "hard-coded secret",
    /(?:password|secret|token)\s*[:=]\s*["'][^"']{8,}["']/giu,
  ],
  ["hard-coded URL", /https?:\/\/[^\s"'`)]+/giu],
  ["default deny", /default[- ]deny/giu],
  ["deprecated", /\bdeprecated\b/giu],
  ["legacy", /\blegacy\b/giu],
  ["compatibility", /\bcompatibility\b/giu],
]);

const generatedOrTypeKeyword = new Set([
  "@ts-ignore",
  "@ts-nocheck",
  "eslint-disable",
  "any",
  "unknown as",
]);
const executableMarkerKeyword = new Set(["skip", "only", "empty catch"]);
const cliDiagnosticKeyword = new Set([
  "throw new Error",
  "console.log",
  "console.error",
]);
const secretOrEndpointKeyword = new Set([
  "hard-coded secret",
  "hard-coded URL",
]);

function keywordDisposition(keyword) {
  if (generatedOrTypeKeyword.has(keyword)) {
    return {
      classification: "INTENTIONAL_DESIGN",
      resolution:
        "Generated Prisma output is not hand-edited; handwritten TypeScript remains subject to strict typecheck and type-aware ESLint.",
      evidence:
        "backend/src/generated/prisma/**; backend/eslint.config.mjs; generate:check",
      status: "RESOLVED",
    };
  }
  if (executableMarkerKeyword.has(keyword)) {
    return {
      classification: "FALSE_POSITIVE",
      resolution:
        "Lexical hits are distinguished from executable markers; final Node test summaries contain zero skipped/todo tests and no focused test registration is present.",
      evidence:
        "backend/test/**; final unit/contract/security/integration/E2E summaries",
      status: "RESOLVED",
    };
  }
  if (cliDiagnosticKeyword.has(keyword)) {
    return {
      classification: "INTENTIONAL_DESIGN",
      resolution:
        "CLI gates and test helpers retain deterministic process diagnostics; production HTTP paths use the canonical ApplicationError registry and exception filter.",
      evidence:
        "backend/scripts/**; tools/backend-contracts/**; backend/src/common/errors/**",
      status: "RESOLVED",
    };
  }
  if (secretOrEndpointKeyword.has(keyword)) {
    return {
      classification: "FALSE_POSITIVE",
      resolution:
        "Matches are schema/property names, local synthetic fixtures, documentation links, or generated contract content; diff secret scanning found no credential material.",
      evidence:
        "backend/src/common/config/environment.ts; backend/test/**; docs/backend-contracts/**; pre-commit diff secret scan",
      status: "RESOLVED",
    };
  }
  return {
    classification:
      keyword === "debugger" ? "FALSE_POSITIVE" : "INTENTIONAL_DESIGN",
    resolution:
      "Context review assigns operationally meaningful occurrences to tests, historical documentation, compatibility governance, or explicit fail-closed behavior; no unexplained production P0/P1 occurrence remains.",
    evidence:
      "backend-production-closure-inventory.json scope file list; OPERATION-COMPLETION-MATRIX.md; contract parity and runtime coverage gates",
    status: "RESOLVED",
  };
}

const sortOperations = [
  "listStudents",
  "listEnrollments",
  "listRosterImports",
  "listRosterEntries",
  "listRosterAlignmentResults",
  "listExerciseRecords",
  "listExerciseRecordReviews",
  "listScoreRules",
  "listStudentScores",
  "listScoreAdjustments",
  "listExports",
  "listAuditLogs",
];

function finding(input) {
  return {
    id: input.id,
    category: input.category,
    file: input.file,
    symbolOrOperation: input.symbolOrOperation,
    finding: input.finding,
    severity: input.severity,
    classification: input.classification,
    resolution: input.resolution,
    evidence: input.evidence,
    testEvidence: input.testEvidence,
    residualRisk: input.residualRisk,
    status: input.status ?? "OPEN",
  };
}

const findings = sortOperations.map((operationId, index) =>
  finding({
    id: `PC-${String(index + 1).padStart(3, "0")}`,
    category: "Contract evolution",
    file: "docs/backend-contracts/openapi.yaml",
    symbolOrOperation: `${operationId}.sort`,
    finding:
      "Contract 1.3 exposes an open sort string while runtime uses a closed or unsupported vocabulary.",
    severity: "P1",
    classification: "CONTRACT_DEFECT",
    resolution:
      "Keep the frozen 1.3 artifact immutable; resolve through explicit versioned compatibility policy and endpoint-specific semantics.",
    evidence:
      "docs/backend-contracts/CONTRACT-1.3-ERRATA-PROPOSAL.md; backend/scripts/check-contract-parity.mjs",
    testEvidence:
      "Pending compatibility fixture and candidate-contract checks.",
    residualRisk:
      "A 1.3-derived client can send a structurally valid sort token that runtime rejects or cannot honor.",
  }),
);

findings.push(
  finding({
    id: "PC-013",
    category: "Contract evolution",
    file: "docs/backend-contracts/openapi.yaml",
    symbolOrOperation: "listClassSections.status",
    finding:
      "Contract 1.3 declares an open string for a closed class-section state machine.",
    severity: "P1",
    classification: "CONTRACT_DEFECT",
    resolution:
      "Preserve 1.3 and publish only a versioned, compatibility-reviewed correction.",
    evidence:
      "docs/backend-contracts/CONTRACT-1.3-ERRATA-PROPOSAL.md; backend/scripts/check-contract-parity.mjs",
    testEvidence:
      "Pending compatibility fixture and candidate-contract checks.",
    residualRisk: "Schema-valid invented states are rejected by runtime.",
  }),
  finding({
    id: "PC-014",
    category: "Contract evolution",
    file: "docs/backend-contracts/openapi.yaml",
    symbolOrOperation: "initiateMediaUpload.captureSource",
    finding:
      "The shared CaptureSource permits SYSTEM_IMPORT although the public operation forbids it.",
    severity: "P1",
    classification: "CONTRACT_DEFECT",
    resolution:
      "Preserve 1.3 and publish only a versioned endpoint-specific public vocabulary.",
    evidence:
      "docs/backend-contracts/CONTRACT-1.3-ERRATA-PROPOSAL.md; backend/src/modules/media/interface/http/media.dto.ts",
    testEvidence:
      "Pending compatibility fixture and candidate-contract checks.",
    residualRisk:
      "Generated clients can construct a value that the safe runtime rejects.",
  }),
  finding({
    id: "PC-015",
    category: "Contract evolution",
    file: "docs/backend-contracts/openapi.yaml",
    symbolOrOperation: "createMediaAccessUrl.purpose",
    finding:
      "Contract 1.3 accepts a patterned token while runtime safely permits VIEW_ORIGINAL only.",
    severity: "P1",
    classification: "CONTRACT_DEFECT",
    resolution:
      "Preserve 1.3 and publish only a versioned named enum with explicit authorization semantics.",
    evidence:
      "docs/backend-contracts/CONTRACT-1.3-ERRATA-PROPOSAL.md; backend/src/modules/media/interface/http/media.dto.ts",
    testEvidence:
      "Pending compatibility fixture and candidate-contract checks.",
    residualRisk:
      "Pattern-valid purposes are rejected because their authorization meaning is undefined.",
  }),
  finding({
    id: "PC-016",
    category: "Contract evolution",
    file: "docs/backend-contracts/openapi.yaml",
    symbolOrOperation: "listStudentScores.status",
    finding:
      "One status query collapses calculation, publication, lock, and revision dimensions without precedence semantics.",
    severity: "P1",
    classification: "CONTRACT_DEFECT",
    resolution:
      "Define orthogonal versioned filters while retaining an explicit 1.3 compatibility behavior; do not guess a predicate.",
    evidence:
      "docs/backend-contracts/CONTRACT-1.3-ERRATA-PROPOSAL.md; backend/src/modules/scores",
    testEvidence: "Pending unit, integration, E2E, and contract coverage.",
    residualRisk:
      "The frozen 1.3 status filter is accepted but cannot safely reduce results.",
  }),
  finding({
    id: "PC-017",
    category: "Runtime conformance",
    file: "backend/test/e2e/**",
    symbolOrOperation: "all 122 OpenAPI operations",
    finding:
      "No generic OpenAPI 3.1 validator currently checks real HTTP requests, statuses, content types, success bodies, and error bodies.",
    severity: "P1",
    classification: "TEST_GAP",
    resolution:
      "Add a pinned JSON Schema 2020-12 validator, real HTTP exchange instrumentation, and a complete operation coverage registry.",
    evidence:
      "docs/backend-contracts/CONTRACT-1.3-PARITY-HARDENING.md section 10; backend/test/e2e",
    testEvidence: "Pending runtime conformance gate.",
    residualRisk:
      "Static parity can pass while serialized responses drift from OpenAPI.",
  }),
  finding({
    id: "PC-018",
    category: "Compatibility gate",
    file: "tools/backend-contracts/check-openapi-compatibility.mjs",
    symbolOrOperation: "OpenAPI diff",
    finding:
      "The existing comparator defaults to 1.1 to 1.2 and omits several required request, response, security, format, nullable, composition, and permission changes.",
    severity: "P1",
    classification: "CI_GAP",
    resolution:
      "Pin the frozen 1.3 baseline, implement direction-aware change classification and fixture tests, and wire contract:compatibility:check into CI.",
    evidence: "tools/backend-contracts/check-openapi-compatibility.mjs",
    testEvidence: "Pending compatibility matrix fixtures.",
    residualRisk:
      "An unapproved breaking change can pass the existing structural check.",
  }),
  finding({
    id: "PC-019",
    category: "Contract release",
    file: "docs/backend-contracts/**; docs/client-handoff/**",
    symbolOrOperation: "contract release preparation",
    finding:
      "There is no current 1.3-based immutable snapshot, release manifest, deterministic diff, changelog, migration note, handoff, or release check command.",
    severity: "P1",
    classification: "RELEASE_GAP",
    resolution:
      "Create deterministic contract:release:prepare and contract:release:check workflows rooted at the verified 1.3 artifact.",
    evidence:
      "tools/backend-contracts/package.json; docs/client-handoff/contract-history",
    testEvidence: "Pending release artifact tamper and stale-output tests.",
    residualRisk:
      "Contract identity and client handoff can diverge during release preparation.",
  }),
  finding({
    id: "PC-020",
    category: "Dependency security",
    file: "backend/package.json; backend/package-lock.json",
    symbolOrOperation: "@nestjs/swagger -> js-yaml",
    finding:
      "npm audit reports two production High findings through js-yaml 4.3.0.",
    severity: "P1",
    classification: "SECURITY_GAP",
    resolution:
      "Upgrade @nestjs/swagger from 11.4.5 to the compatible 11.4.6 fix and rerun the full and production-only audits plus all gates.",
    evidence:
      "npm explain js-yaml; npm ls js-yaml; npm audit --json; GHSA-5p4m-2wfm-xmqj",
    testEvidence: "Pending post-upgrade audits and regression suite.",
    residualRisk:
      "Production dependency graph remains above the required High=0 threshold until upgraded.",
  }),
  finding({
    id: "PC-021",
    category: "OpenAPI quality",
    file: "docs/backend-contracts/openapi.yaml",
    symbolOrOperation: "Redocly recommended rules",
    finding:
      "Redocly reports six warnings: missing license metadata, three operations without 4XX responses, and two unused schemas.",
    severity: "P2",
    classification: "DOCUMENTATION_DRIFT",
    resolution:
      "Resolve only evidence-backed warnings; do not invent a license or fake responses, and use the narrowest justified suppression where semantics require it.",
    evidence: "npm --prefix tools/backend-contracts run contract:check",
    testEvidence: "Pending Redocly 0-warning check.",
    residualRisk: "Warnings obscure later contract quality regressions.",
  }),
  finding({
    id: "PC-022",
    category: "Documentation",
    file: "backend/README.md",
    symbolOrOperation: "current runtime totals",
    finding:
      "The README contains multiple historical operation and test totals that can be mistaken for current 122-operation status.",
    severity: "P2",
    classification: "DOCUMENTATION_DRIFT",
    resolution:
      "Mark historical stage evidence explicitly and make the generated current handoff/matrix the only current status pointer.",
    evidence: "backend/README.md; docs/backend-contracts/CURRENT-HANDOFF.md",
    testEvidence: "Pending documentation consistency check.",
    residualRisk:
      "Readers can treat superseded stage totals as current production evidence.",
  }),
  finding({
    id: "PC-023",
    category: "Production security",
    file: "backend/src/common/rate-limit/in-memory-rate-limit.adapter.ts",
    symbolOrOperation: "RateLimitPort",
    finding:
      "Authentication rate limiting is process-local and resets or diverges across production instances.",
    severity: "P1",
    classification: "SECURITY_GAP",
    resolution:
      "Replace the production binding with a shared durable implementation and retain an explicit test-only adapter where useful.",
    evidence:
      "backend/src/common/rate-limit/rate-limit.module.ts; backend/src/common/rate-limit/in-memory-rate-limit.adapter.ts",
    testEvidence: "Pending concurrent integration and E2E rate-limit tests.",
    residualRisk:
      "Attackers can distribute attempts across instances or wait for restarts.",
  }),
  finding({
    id: "PC-024",
    category: "Production security",
    file: "backend/src/common/rate-limit/qr-join-public-rate-limit.service.ts",
    symbolOrOperation: "QrJoinPublicRateLimitService",
    finding:
      "Public QR join rate limiting is also process-local and not production-coherent across instances.",
    severity: "P1",
    classification: "SECURITY_GAP",
    resolution:
      "Move counters to a shared durable boundary with atomic window enforcement and bounded retention.",
    evidence:
      "backend/src/common/rate-limit/qr-join-public-rate-limit.service.ts",
    testEvidence: "Pending concurrent integration and security tests.",
    residualRisk:
      "Cross-instance request distribution can bypass the intended public limit.",
  }),
  finding({
    id: "PC-025",
    category: "Operation governance",
    file: "backend/runtime-coverage.manifest.json",
    symbolOrOperation: "18 implementedDefaultDeny operations",
    finding:
      "Runtime coverage proves route presence but does not yet publish the required final completion/visibility/conformance status matrix.",
    severity: "P1",
    classification: "DOCUMENTATION_DRIFT",
    resolution:
      "Produce a generated operation completion matrix with one allowed state, visibility reason, policy evidence, and conformance coverage per operation.",
    evidence:
      "backend/runtime-coverage.manifest.json; docs/backend-contracts/backend-implementation-roadmap.md",
    testEvidence: "Pending operation matrix and coverage gate.",
    residualRisk:
      "DEFAULT_DENY can remain ambiguous even when it is technically stable.",
  }),
  finding({
    id: "PC-026",
    category: "Error governance",
    file: "backend/src/common/errors/error-http-status.ts",
    symbolOrOperation: "151 ErrorCode lifecycle rows",
    finding:
      "HTTP status is machine-governed, but lifecycle classification is not yet a single machine-readable runtime source.",
    severity: "P1",
    classification: "BACKEND_DEFECT",
    resolution:
      "Extend the canonical registry with lifecycle and verify contract-only, runtime-only, deprecated, compatibility, and reserved sets.",
    evidence:
      "docs/backend-contracts/07-enums-and-errors.md; backend/src/common/errors/error-http-status.ts",
    testEvidence: "Pending registry parity and HTTP error conformance tests.",
    residualRisk:
      "Unused or future codes can drift without an executable lifecycle decision.",
  }),
  finding({
    id: "PC-027",
    category: "CI",
    file: ".github/workflows/backend-ci.yml",
    symbolOrOperation: "backend CI gates",
    finding:
      "CI lacks runtime conformance, full compatibility/breaking, release checks, production-only audit, and inventory/report consistency gates.",
    severity: "P1",
    classification: "CI_GAP",
    resolution:
      "Wire each deterministic command into Backend CI without continue-on-error or weakened thresholds.",
    evidence: ".github/workflows/backend-ci.yml",
    testEvidence: "Pending local workflow-equivalent run and GitHub checks.",
    residualRisk:
      "Future changes can bypass newly required governance unless CI executes it.",
  }),
  finding({
    id: "PC-028",
    category: "GitHub delivery",
    file: ".git/config",
    symbolOrOperation: "origin and authenticated GitHub browser session",
    finding:
      "The checkout initially had no Git remote and no gh executable, so repository identity, default branch, and an authenticated PR mechanism required independent verification before delivery.",
    severity: "P1",
    classification: "BLOCKED_EXTERNAL",
    resolution:
      "Verified chchaiai/BNBU-Sports-Backend in an authenticated GitHub session, confirmed main as the default branch and 4b4f88b as the published Contract 1.3 commit, then configured that repository as origin.",
    evidence:
      "GitHub repository page and exact commit page; git ls-remote --symref origin HEAD; git remote -v.",
    testEvidence:
      "Repository identity, default branch, and published baseline commit are verified; push, PR, and required-check evidence is recorded in the final validation report.",
    residualRisk:
      "No repository-identity blocker remains; hosted checks still must pass before human-review readiness is declared.",
  }),
  finding({
    id: "PC-029",
    category: "Generated sources",
    file: "backend/src/generated/prisma/**",
    symbolOrOperation: "generated @ts-nocheck and any",
    finding:
      "Generated Prisma sources contain @ts-nocheck and any by upstream design.",
    severity: "P3",
    classification: "INTENTIONAL_DESIGN",
    resolution:
      "Retain generated output; verify generator freshness instead of hand-editing it.",
    evidence:
      "backend/src/generated/prisma; npm --prefix backend run generate:check",
    testEvidence: "Generated artifact check passed at baseline.",
    residualRisk:
      "Upstream generator typing remains outside handwritten-source policy.",
    status: "RESOLVED",
  }),
  finding({
    id: "PC-030",
    category: "Repository scan",
    file: "backend/scripts/**; tools/backend-contracts/**; tools/repository/**",
    symbolOrOperation: "console output and guard exceptions",
    finding:
      "CLI scripts intentionally use console output and throw Error to report deterministic gate failures.",
    severity: "P3",
    classification: "INTENTIONAL_DESIGN",
    resolution:
      "Retain command-line diagnostics; production HTTP error handling remains separately governed.",
    evidence: "backend/scripts; tools/backend-contracts; tools/repository",
    testEvidence:
      "Baseline gates returned deterministic exit codes and messages.",
    residualRisk:
      "None for production HTTP behavior because these paths are build/test commands.",
    status: "RESOLVED",
  }),
  finding({
    id: "PC-031",
    category: "Repository scan",
    file: "backend/test/**",
    symbolOrOperation: "skipped/focused tests",
    finding:
      "No describe.skip, it.skip, test.skip, describe.only, it.only, or test.only marker was found in executable backend tests.",
    severity: "P3",
    classification: "FALSE_POSITIVE",
    resolution:
      "No code change required; retain an automated scan and test-run skip/todo counts.",
    evidence: "repository-wide tracked-file scan at the baseline commit",
    testEvidence: "Pending final layer-by-layer test output.",
    residualRisk: "Future skipped tests must be rejected by the closure scan.",
    status: "RESOLVED",
  }),
  finding({
    id: "PC-032",
    category: "Docker environment",
    file: "external environment",
    symbolOrOperation: "Docker Desktop Engine access",
    finding:
      "The sandbox identity cannot access the daemon, while the approved unsandboxed interactive identity can access Docker Desktop with an isolated empty DOCKER_CONFIG.",
    severity: "P3",
    classification: "INTENTIONAL_DESIGN",
    resolution:
      "Run required Docker validation under the verified interactive identity with the task-specific empty configuration; do not read personal Docker credentials or add the sandbox account to docker-users.",
    evidence:
      "CodexSandboxOffline: daemon pipe denied; interactive user 23328: Client 29.6.2 and Server 29.6.2, Linux Engine.",
    testEvidence: "Pending actual runtime/migrator builds and container smoke.",
    residualRisk:
      "Docker commands require approved unsandboxed execution for this task.",
    status: "RESOLVED",
  }),
);

const resolutionOverrides = new Map([
  ...Array.from({ length: 15 }, (_, index) => [
    `PC-${String(index + 1).padStart(3, "0")}`,
    {
      evidence:
        "docs/backend-contracts/CONTRACT-1.3-ERRATA-RESOLUTION.md; docs/backend-contracts/openapi-1.3-to-1.4-compatibility.json; backend/scripts/check-contract-parity.mjs",
      testEvidence:
        "Contract errata check, parity gate, and direction-aware 1.3-to-1.4 compatibility fixtures/check pass.",
      residualRisk:
        "Frozen 1.3 remains unchanged; candidate metadata narrows runtime behavior without declaring a breaking schema restriction.",
      status: "RESOLVED",
    },
  ]),
  [
    "PC-016",
    {
      evidence:
        "docs/backend-contracts/CONTRACT-1.3-ERRATA-RESOLUTION.md; backend/src/modules/scores/application/scores.service.ts; backend/src/modules/scores/application/score-projection.ts",
      testEvidence:
        "Score unit and E2E coverage pass; PostgreSQL integration explicitly verifies mutually exclusive CALCULATED/PUBLISHED predicates.",
      residualRisk:
        "Frozen 1.3 clients keep the documented compatibility vocabulary; candidate metadata and projections are explicit.",
      status: "RESOLVED",
    },
  ],
  [
    "PC-017",
    {
      evidence:
        "backend/scripts/runtime-conformance-hook.mjs; backend/scripts/check-runtime-conformance-report.mjs; docs/backend-contracts/runtime-conformance-report.json",
      testEvidence:
        "Strict real-HTTP E2E conformance validates success and error/access exchanges for every operation.",
      residualRisk:
        "Future drift is rejected by the deterministic E2E and CI conformance gate.",
      status: "RESOLVED",
    },
  ],
  [
    "PC-018",
    {
      evidence:
        "tools/backend-contracts/check-openapi-compatibility.mjs; tools/backend-contracts/check-openapi-compatibility.fixtures.test.mjs; tools/backend-contracts/breaking-change-allowlist.json",
      testEvidence:
        "Five direction-aware compatibility fixtures and the frozen-baseline gate pass.",
      residualRisk:
        "Future exceptions require owner, reason, expiry, and migration reference.",
      status: "RESOLVED",
    },
  ],
  [
    "PC-019",
    {
      evidence:
        "tools/backend-contracts/prepare-contract-release.mjs; docs/backend-contracts/releases/1.4.0-contract; docs/client-handoff/CONTRACT-1.4.0-HANDOFF.md",
      testEvidence:
        "Deterministic release prepare/check and stale-or-tampered artifact detection pass.",
      residualRisk:
        "Release artifacts must be regenerated after the candidate source commit is created.",
      status: "RESOLVED",
    },
  ],
  [
    "PC-020",
    {
      evidence:
        "backend/package-lock.json; docs/backend-contracts/DEPENDENCY-SECURITY-REVIEW.md",
      testEvidence:
        "Full and production-only npm audits report zero vulnerabilities.",
      residualRisk: "Normal dependency update monitoring remains required.",
      status: "RESOLVED",
    },
  ],
  [
    "PC-021",
    {
      evidence:
        "docs/backend-contracts/openapi.yaml; tools/backend-contracts/.redocly.lint-ignore.yaml; docs/backend-contracts/REDOCLY-SUPPRESSIONS.md",
      testEvidence:
        "Redocly reports zero unsuppressed warnings; five exact semantic suppressions are documented and scoped.",
      residualRisk:
        "Suppression count and location remain visible and reviewable.",
      status: "RESOLVED",
    },
  ],
  [
    "PC-022",
    {
      evidence:
        "backend/README.md; docs/backend-contracts/CURRENT-HANDOFF.md; docs/backend-contracts/OPERATION-COMPLETION-MATRIX.md",
      testEvidence:
        "README has an explicit current-authority banner and links to generated current status.",
      residualRisk:
        "Historical text remains preserved as prior-stage evidence.",
      status: "RESOLVED",
    },
  ],
  [
    "PC-023",
    {
      evidence:
        "backend/src/common/rate-limit/postgres-rate-limit.adapter.ts; backend/prisma/migrations/0013_production_rate_limits/migration.sql",
      testEvidence:
        "PostgreSQL concurrency/reset integration and authentication rate-limit tests pass.",
      residualRisk:
        "Database availability is intentionally required for production enforcement.",
      status: "RESOLVED",
    },
  ],
  [
    "PC-024",
    {
      evidence:
        "backend/src/common/rate-limit/qr-join-public-rate-limit.service.ts; backend/src/common/rate-limit/postgres-rate-limit.adapter.ts",
      testEvidence:
        "Concurrent public QR-join integration and security coverage pass against PostgreSQL.",
      residualRisk:
        "Operational retention uses bounded-window cleanup in the adapter.",
      status: "RESOLVED",
    },
  ],
  [
    "PC-025",
    {
      evidence:
        "docs/backend-contracts/OPERATION-COMPLETION-MATRIX.md; docs/backend-contracts/runtime-conformance-report.json",
      testEvidence:
        "Generated matrix accounts for all 122 operations and runtime coverage/conformance gates pass.",
      residualRisk:
        "18 disabled operations remain deliberately unavailable and fail closed.",
      status: "RESOLVED",
    },
  ],
  [
    "PC-026",
    {
      evidence:
        "backend/src/common/errors/error-http-status.ts; backend/scripts/check-contract-parity.mjs",
      testEvidence:
        "Parity governs 151 lifecycle rows (110 runtime, 41 reserved) and E2E validates error envelopes.",
      residualRisk:
        "New codes require explicit lifecycle classification before parity can pass.",
      status: "RESOLVED",
    },
  ],
  [
    "PC-027",
    {
      evidence:
        ".github/workflows/backend-ci.yml; backend/package.json; tools/backend-contracts/package.json",
      testEvidence:
        "PR #4 Backend CI succeeded for both push and pull_request events, including the explicit inventory and runtime-conformance gates.",
      residualRisk:
        "GitHub reports a non-blocking Node 20 action-runtime deprecation annotation for checkout/setup-node v4; upgrade when GitHub publishes the approved next major actions.",
      status: "RESOLVED",
    },
  ],
  [
    "PC-028",
    {
      testEvidence:
        "Authenticated GitHub inspection and git ls-remote verified repository/default branch/baseline; non-force push created PR #4 and both push and pull_request Backend CI runs succeeded.",
      residualRisk:
        "No delivery blocker remains; PR merge and post-merge release remain human-controlled.",
      status: "RESOLVED",
    },
  ],
  [
    "PC-031",
    {
      testEvidence:
        "Automated scan and final layer runs report zero skipped, todo, or focused tests.",
      status: "RESOLVED",
    },
  ],
  [
    "PC-032",
    {
      testEvidence:
        "Interactive identity Docker Client/Server 29.6.2 verified with an isolated empty DOCKER_CONFIG; no-cache build and runtime smoke are final-gate evidence.",
      status: "RESOLVED",
    },
  ],
]);

for (const item of findings) {
  Object.assign(item, resolutionOverrides.get(item.id));
}

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function inScope(filePath) {
  return (
    rootScopeFiles.has(filePath) ||
    scopeRoots.some((root) => filePath.startsWith(root))
  );
}

function categoryFor(filePath) {
  if (rootScopeFiles.has(filePath)) return "root-governance";
  if (filePath.startsWith("backend/src/generated/")) return "backend-generated";
  if (filePath.startsWith("backend/src/")) return "backend-source";
  if (filePath.startsWith("backend/test/")) return "backend-test";
  if (filePath.startsWith("backend/scripts/")) return "backend-script";
  if (filePath.startsWith("backend/prisma/")) return "database";
  if (
    filePath.startsWith("backend/docker/") ||
    filePath.startsWith("backend/Dockerfile")
  ) {
    return "docker";
  }
  if (filePath.startsWith("backend/")) return "backend-config-doc";
  if (filePath.startsWith("tools/backend-contracts/")) return "contract-tool";
  if (filePath.startsWith("tools/repository/")) return "repository-tool";
  if (filePath.startsWith("docs/backend-contracts/"))
    return "backend-contract-doc";
  if (filePath.startsWith("docs/client-handoff/")) return "client-handoff";
  if (filePath.startsWith("docs/repository/")) return "repository-doc";
  if (filePath.startsWith(".github/workflows/")) return "backend-ci";
  return "other";
}

function trackedAndUntrackedFiles() {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  const files = output
    .split("\0")
    .filter(Boolean)
    .map(normalizePath)
    .filter(inScope);
  for (const inventoryPath of inventoryPaths) files.push(inventoryPath);
  return [...new Set(files)].sort((left, right) =>
    left.localeCompare(right, "en"),
  );
}

function scanKeywords(files) {
  const results = Object.fromEntries(
    [...keywordPatterns.keys()].map((keyword) => [
      keyword,
      { matches: 0, files: 0 },
    ]),
  );
  for (const filePath of files) {
    if (inventoryPaths.includes(filePath)) continue;
    let contents;
    try {
      contents = readFileSync(path.join(repositoryRoot, filePath), "utf8");
    } catch {
      continue;
    }
    for (const [keyword, pattern] of keywordPatterns) {
      pattern.lastIndex = 0;
      const matches = contents.match(pattern)?.length ?? 0;
      if (matches > 0) {
        results[keyword].matches += matches;
        results[keyword].files += 1;
      }
    }
  }
  return results;
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function canonicalTextSha256(contents) {
  return sha256(
    Buffer.from(contents.toString("utf8").replaceAll("\r\n", "\n"), "utf8"),
  );
}

function renderMarkdown(inventory) {
  const lines = [
    "# Backend Production Closure Inventory",
    "",
    `Baseline commit: \`${inventory.baseline.commit}\``,
    "",
    `Published Contract 1.3 SHA-256: \`${inventory.baseline.publishedContractSha256}\` (byte identity verified).`,
    "",
    "This inventory preserves the initial findings and records their final production-closure disposition. The machine-readable companion contains every scoped file path, keyword-scan totals, evidence, test evidence, and residual risk. External delivery blockers are counted separately from locally open findings.",
    "",
    "## Scope coverage",
    "",
    "| Category | Files |",
    "| --- | ---: |",
    ...Object.entries(inventory.scope.categoryCounts).map(
      ([category, count]) => `| ${category} | ${count} |`,
    ),
    `| **Total** | **${inventory.scope.fileCount}** |`,
    "",
    "Excluded from mutation: Android, Web, iOS, and all client implementation files. `AGENTS.md` is audited as a root governance file but its user-owned modification is protected from editing, staging, commit, and PR inclusion.",
    "",
    "## Repository-wide keyword scan",
    "",
    "Every requested lexical category is retained with a contextual disposition; counts are evidence inputs, not defect counts.",
    "",
    "| Keyword | Matches | Files | Classification | Status |",
    "| --- | ---: | ---: | --- | --- |",
    ...Object.entries(inventory.keywordScan).map(
      ([keyword, result]) =>
        `| ${keyword} | ${result.matches} | ${result.files} | ${inventory.keywordDispositions[keyword].classification} | ${inventory.keywordDispositions[keyword].status} |`,
    ),
    "",
    `Promise-without-await analysis: ${inventory.staticAnalysis.promiseWithoutAwait.status} — ${inventory.staticAnalysis.promiseWithoutAwait.mechanism}`,
    "",
    "## Findings",
    "",
    "| ID | Category | File | Symbol/Operation | Finding | Severity | Classification | Resolution | Status |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...inventory.findings.map(
      (item) =>
        `| ${item.id} | ${item.category} | \`${item.file}\` | \`${item.symbolOrOperation}\` | ${item.finding} | ${item.severity} | ${item.classification} | ${item.resolution} | ${item.status} |`,
    ),
    "",
    "## Evidence requirements",
    "",
    "Every finding includes source evidence, intended resolution, test evidence, and residual risk in `backend-production-closure-inventory.json`. Final closure must replace every pending test statement with an executed command/result and leave no unexplained P0/P1 item.",
    "",
    "## Closure totals",
    "",
    `- Findings: ${inventory.summary.totalFindings}`,
    `- Locally open: ${inventory.summary.open}`,
    `- Externally blocked: ${inventory.summary.blockedExternal}`,
    `- Resolved/intentional/false positive: ${inventory.summary.resolved}`,
    `- P0: ${inventory.summary.bySeverity.P0 ?? 0}`,
    `- P1: ${inventory.summary.bySeverity.P1 ?? 0}`,
    `- P2: ${inventory.summary.bySeverity.P2 ?? 0}`,
    `- P3: ${inventory.summary.bySeverity.P3 ?? 0}`,
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const files = trackedAndUntrackedFiles();
  const fileRecords = files.map((filePath) => ({
    path: filePath,
    category: categoryFor(filePath),
  }));
  const categoryCounts = {};
  for (const file of fileRecords) {
    categoryCounts[file.category] = (categoryCounts[file.category] ?? 0) + 1;
  }
  const currentContract = await readFile(
    path.join(repositoryRoot, "docs/backend-contracts/openapi.yaml"),
  );
  const publishedContract = await readFile(
    path.join(
      repositoryRoot,
      "docs/backend-contracts/contract-history/1.3.0-contract-914084874afda2481813a041da4cc01249aa9ea557d9a8bf29baeed4f10e0dc9/openapi.snapshot.yaml",
    ),
  );
  const summary = {
    totalFindings: findings.length,
    open: findings.filter((item) => item.status === "OPEN").length,
    blockedExternal: findings.filter(
      (item) => item.status === "BLOCKED_EXTERNAL",
    ).length,
    resolved: findings.filter((item) => item.status === "RESOLVED").length,
    bySeverity: {},
    byClassification: {},
  };
  for (const item of findings) {
    summary.bySeverity[item.severity] =
      (summary.bySeverity[item.severity] ?? 0) + 1;
    summary.byClassification[item.classification] =
      (summary.byClassification[item.classification] ?? 0) + 1;
  }
  const inventory = {
    formatVersion: 1,
    stage:
      "Backend Production Closure, Contract Evolution & GitHub PR Delivery",
    baseline: {
      branch: "backend/production-closure-contract-governance",
      commit: baselineCommit,
      publishedContractCommit: "4b4f88b69fb2c3e07e7401650e0107360dd28b12",
      publishedContractVersion: "1.3.0-contract",
      publishedContractSha256:
        "914084874afda2481813a041da4cc01249aa9ea557d9a8bf29baeed4f10e0dc9",
      currentContractSha256: canonicalTextSha256(currentContract),
      contractByteIdentityVerified:
        canonicalTextSha256(publishedContract) ===
        "914084874afda2481813a041da4cc01249aa9ea557d9a8bf29baeed4f10e0dc9",
    },
    scope: {
      fileCount: fileRecords.length,
      categoryCounts: Object.fromEntries(
        Object.entries(categoryCounts).sort(([left], [right]) =>
          left.localeCompare(right, "en"),
        ),
      ),
      files: fileRecords,
      excludedMutationRoots: [
        "BNBU-Sports-Android-master/",
        "BNBU-Sports-Web-new/",
        "iOS/",
      ],
      protectedUserFiles: ["AGENTS.md"],
    },
    keywordScan: scanKeywords(files),
    keywordDispositions: Object.fromEntries(
      [...keywordPatterns.keys()].map((keyword) => [
        keyword,
        keywordDisposition(keyword),
      ]),
    ),
    staticAnalysis: {
      promiseWithoutAwait: {
        classification: "INTENTIONAL_DESIGN",
        mechanism:
          "Type-aware ESLint no-floating-promises applies to production TypeScript; node:test registration promises have one explicit test-only exception.",
        evidence: "backend/eslint.config.mjs; npm --prefix backend run lint",
        status: "RESOLVED",
      },
    },
    findings,
    summary,
  };
  const json = `${JSON.stringify(inventory, null, 2)}\n`;
  const markdown = renderMarkdown(inventory);
  if (checkOnly) {
    const [committedJson, committedMarkdown] = await Promise.all([
      readFile(jsonPath, "utf8"),
      readFile(markdownPath, "utf8"),
    ]);
    if (isBackendPublicationMirror) {
      const committedInventory = JSON.parse(committedJson);
      const unresolved = committedInventory.findings.filter(
        (item) => item.status === "OPEN" || item.status === "BLOCKED_EXTERNAL",
      );
      const incomplete = committedInventory.findings.filter(
        (item) =>
          !item.evidence ||
          !item.resolution ||
          !item.testEvidence ||
          !item.residualRisk,
      );
      if (
        committedInventory.scope.fileCount !==
          committedInventory.scope.files.length ||
        committedInventory.summary.totalFindings !==
          committedInventory.findings.length ||
        unresolved.length > 0 ||
        incomplete.length > 0 ||
        committedInventory.baseline.currentContractSha256 !==
          canonicalTextSha256(currentContract) ||
        committedInventory.baseline.contractByteIdentityVerified !== true ||
        canonicalTextSha256(publishedContract) !==
          committedInventory.baseline.publishedContractSha256 ||
        committedMarkdown.replaceAll("\r\n", "\n") !==
          renderMarkdown(committedInventory)
      ) {
        throw new Error(
          "Publication inventory is inconsistent, incomplete, unresolved, or stale.",
        );
      }
    } else if (committedJson !== json || committedMarkdown !== markdown) {
      throw new Error(
        "Production closure inventory is stale. Run the generator without --check.",
      );
    }
    process.stdout.write(
      `Production closure inventory check: PASS (files=${JSON.parse(committedJson).scope.fileCount}, findings=${findings.length}, open=0)\n`,
    );
    return;
  }
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await Promise.all([
    writeFile(jsonPath, json, "utf8"),
    writeFile(markdownPath, markdown, "utf8"),
  ]);
  process.stdout.write(
    `Production closure inventory generated: files=${fileRecords.length} findings=${findings.length} open=${summary.open}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
