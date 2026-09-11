# Backend Production Closure Inventory

Baseline commit: `c771194a36074a344d4aae1ad9b6486c6cd7d978`

Published Contract 1.3 SHA-256: `914084874afda2481813a041da4cc01249aa9ea557d9a8bf29baeed4f10e0dc9` (byte identity verified).

This inventory preserves the initial findings and records their final production-closure disposition. The machine-readable companion contains every scoped file path, keyword-scan totals, evidence, test evidence, and residual risk. External delivery blockers are counted separately from locally open findings.

## Scope coverage

| Category | Files |
| --- | ---: |
| backend-ci | 1 |
| backend-config-doc | 29 |
| backend-contract-doc | 246 |
| backend-generated | 88 |
| backend-script | 16 |
| backend-source | 225 |
| backend-test | 81 |
| client-handoff | 51 |
| contract-tool | 14 |
| database | 43 |
| docker | 2 |
| repository-doc | 1 |
| repository-tool | 5 |
| root-governance | 6 |
| **Total** | **808** |

Excluded from mutation: Android, Web, iOS, and all client implementation files. `AGENTS.md` is audited as a root governance file but its user-owned modification is protected from editing, staging, commit, and PR inclusion.

## Repository-wide keyword scan

Every requested lexical category is retained with a contextual disposition; counts are evidence inputs, not defect counts.

| Keyword | Matches | Files | Classification | Status |
| --- | ---: | ---: | --- | --- |
| TODO | 27 | 16 | INTENTIONAL_DESIGN | RESOLVED |
| FIXME | 1 | 1 | INTENTIONAL_DESIGN | RESOLVED |
| HACK | 1 | 1 | INTENTIONAL_DESIGN | RESOLVED |
| TEMP | 1 | 1 | INTENTIONAL_DESIGN | RESOLVED |
| temporary | 8 | 4 | INTENTIONAL_DESIGN | RESOLVED |
| placeholder | 198 | 53 | INTENTIONAL_DESIGN | RESOLVED |
| mock | 267 | 83 | INTENTIONAL_DESIGN | RESOLVED |
| stub | 3 | 3 | INTENTIONAL_DESIGN | RESOLVED |
| not implemented | 33 | 27 | INTENTIONAL_DESIGN | RESOLVED |
| NotImplementedException | 1 | 1 | INTENTIONAL_DESIGN | RESOLVED |
| throw new Error | 297 | 53 | INTENTIONAL_DESIGN | RESOLVED |
| console.log | 19 | 11 | INTENTIONAL_DESIGN | RESOLVED |
| console.error | 20 | 9 | INTENTIONAL_DESIGN | RESOLVED |
| debugger | 2 | 1 | FALSE_POSITIVE | RESOLVED |
| @ts-ignore | 3 | 1 | INTENTIONAL_DESIGN | RESOLVED |
| @ts-nocheck | 88 | 84 | INTENTIONAL_DESIGN | RESOLVED |
| eslint-disable | 88 | 86 | INTENTIONAL_DESIGN | RESOLVED |
| any | 440 | 146 | INTENTIONAL_DESIGN | RESOLVED |
| unknown as | 60 | 27 | INTENTIONAL_DESIGN | RESOLVED |
| skip | 1150 | 94 | FALSE_POSITIVE | RESOLVED |
| only | 3 | 1 | FALSE_POSITIVE | RESOLVED |
| empty catch | 0 | 0 | FALSE_POSITIVE | RESOLVED |
| hard-coded secret | 53 | 22 | FALSE_POSITIVE | RESOLVED |
| hard-coded URL | 3519 | 142 | FALSE_POSITIVE | RESOLVED |
| default deny | 1252 | 103 | INTENTIONAL_DESIGN | RESOLVED |
| deprecated | 206 | 46 | INTENTIONAL_DESIGN | RESOLVED |
| legacy | 350 | 62 | INTENTIONAL_DESIGN | RESOLVED |
| compatibility | 714 | 165 | INTENTIONAL_DESIGN | RESOLVED |

Promise-without-await analysis: RESOLVED — Type-aware ESLint no-floating-promises applies to production TypeScript; node:test registration promises have one explicit test-only exception.

## Findings

| ID | Category | File | Symbol/Operation | Finding | Severity | Classification | Resolution | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PC-001 | Contract evolution | `docs/backend-contracts/openapi.yaml` | `listStudents.sort` | Contract 1.3 exposes an open sort string while runtime uses a closed or unsupported vocabulary. | P1 | CONTRACT_DEFECT | Keep the frozen 1.3 artifact immutable; resolve through explicit versioned compatibility policy and endpoint-specific semantics. | RESOLVED |
| PC-002 | Contract evolution | `docs/backend-contracts/openapi.yaml` | `listEnrollments.sort` | Contract 1.3 exposes an open sort string while runtime uses a closed or unsupported vocabulary. | P1 | CONTRACT_DEFECT | Keep the frozen 1.3 artifact immutable; resolve through explicit versioned compatibility policy and endpoint-specific semantics. | RESOLVED |
| PC-003 | Contract evolution | `docs/backend-contracts/openapi.yaml` | `listRosterImports.sort` | Contract 1.3 exposes an open sort string while runtime uses a closed or unsupported vocabulary. | P1 | CONTRACT_DEFECT | Keep the frozen 1.3 artifact immutable; resolve through explicit versioned compatibility policy and endpoint-specific semantics. | RESOLVED |
| PC-004 | Contract evolution | `docs/backend-contracts/openapi.yaml` | `listRosterEntries.sort` | Contract 1.3 exposes an open sort string while runtime uses a closed or unsupported vocabulary. | P1 | CONTRACT_DEFECT | Keep the frozen 1.3 artifact immutable; resolve through explicit versioned compatibility policy and endpoint-specific semantics. | RESOLVED |
| PC-005 | Contract evolution | `docs/backend-contracts/openapi.yaml` | `listRosterAlignmentResults.sort` | Contract 1.3 exposes an open sort string while runtime uses a closed or unsupported vocabulary. | P1 | CONTRACT_DEFECT | Keep the frozen 1.3 artifact immutable; resolve through explicit versioned compatibility policy and endpoint-specific semantics. | RESOLVED |
| PC-006 | Contract evolution | `docs/backend-contracts/openapi.yaml` | `listExerciseRecords.sort` | Contract 1.3 exposes an open sort string while runtime uses a closed or unsupported vocabulary. | P1 | CONTRACT_DEFECT | Keep the frozen 1.3 artifact immutable; resolve through explicit versioned compatibility policy and endpoint-specific semantics. | RESOLVED |
| PC-007 | Contract evolution | `docs/backend-contracts/openapi.yaml` | `listExerciseRecordReviews.sort` | Contract 1.3 exposes an open sort string while runtime uses a closed or unsupported vocabulary. | P1 | CONTRACT_DEFECT | Keep the frozen 1.3 artifact immutable; resolve through explicit versioned compatibility policy and endpoint-specific semantics. | RESOLVED |
| PC-008 | Contract evolution | `docs/backend-contracts/openapi.yaml` | `listScoreRules.sort` | Contract 1.3 exposes an open sort string while runtime uses a closed or unsupported vocabulary. | P1 | CONTRACT_DEFECT | Keep the frozen 1.3 artifact immutable; resolve through explicit versioned compatibility policy and endpoint-specific semantics. | RESOLVED |
| PC-009 | Contract evolution | `docs/backend-contracts/openapi.yaml` | `listStudentScores.sort` | Contract 1.3 exposes an open sort string while runtime uses a closed or unsupported vocabulary. | P1 | CONTRACT_DEFECT | Keep the frozen 1.3 artifact immutable; resolve through explicit versioned compatibility policy and endpoint-specific semantics. | RESOLVED |
| PC-010 | Contract evolution | `docs/backend-contracts/openapi.yaml` | `listScoreAdjustments.sort` | Contract 1.3 exposes an open sort string while runtime uses a closed or unsupported vocabulary. | P1 | CONTRACT_DEFECT | Keep the frozen 1.3 artifact immutable; resolve through explicit versioned compatibility policy and endpoint-specific semantics. | RESOLVED |
| PC-011 | Contract evolution | `docs/backend-contracts/openapi.yaml` | `listExports.sort` | Contract 1.3 exposes an open sort string while runtime uses a closed or unsupported vocabulary. | P1 | CONTRACT_DEFECT | Keep the frozen 1.3 artifact immutable; resolve through explicit versioned compatibility policy and endpoint-specific semantics. | RESOLVED |
| PC-012 | Contract evolution | `docs/backend-contracts/openapi.yaml` | `listAuditLogs.sort` | Contract 1.3 exposes an open sort string while runtime uses a closed or unsupported vocabulary. | P1 | CONTRACT_DEFECT | Keep the frozen 1.3 artifact immutable; resolve through explicit versioned compatibility policy and endpoint-specific semantics. | RESOLVED |
| PC-013 | Contract evolution | `docs/backend-contracts/openapi.yaml` | `listClassSections.status` | Contract 1.3 declares an open string for a closed class-section state machine. | P1 | CONTRACT_DEFECT | Preserve 1.3 and publish only a versioned, compatibility-reviewed correction. | RESOLVED |
| PC-014 | Contract evolution | `docs/backend-contracts/openapi.yaml` | `initiateMediaUpload.captureSource` | The shared CaptureSource permits SYSTEM_IMPORT although the public operation forbids it. | P1 | CONTRACT_DEFECT | Preserve 1.3 and publish only a versioned endpoint-specific public vocabulary. | RESOLVED |
| PC-015 | Contract evolution | `docs/backend-contracts/openapi.yaml` | `createMediaAccessUrl.purpose` | Contract 1.3 accepts a patterned token while runtime safely permits VIEW_ORIGINAL only. | P1 | CONTRACT_DEFECT | Preserve 1.3 and publish only a versioned named enum with explicit authorization semantics. | RESOLVED |
| PC-016 | Contract evolution | `docs/backend-contracts/openapi.yaml` | `listStudentScores.status` | One status query collapses calculation, publication, lock, and revision dimensions without precedence semantics. | P1 | CONTRACT_DEFECT | Define orthogonal versioned filters while retaining an explicit 1.3 compatibility behavior; do not guess a predicate. | RESOLVED |
| PC-017 | Runtime conformance | `backend/test/e2e/**` | `all 122 OpenAPI operations` | No generic OpenAPI 3.1 validator currently checks real HTTP requests, statuses, content types, success bodies, and error bodies. | P1 | TEST_GAP | Add a pinned JSON Schema 2020-12 validator, real HTTP exchange instrumentation, and a complete operation coverage registry. | RESOLVED |
| PC-018 | Compatibility gate | `tools/backend-contracts/check-openapi-compatibility.mjs` | `OpenAPI diff` | The existing comparator defaults to 1.1 to 1.2 and omits several required request, response, security, format, nullable, composition, and permission changes. | P1 | CI_GAP | Pin the frozen 1.3 baseline, implement direction-aware change classification and fixture tests, and wire contract:compatibility:check into CI. | RESOLVED |
| PC-019 | Contract release | `docs/backend-contracts/**; docs/client-handoff/**` | `contract release preparation` | There is no current 1.3-based immutable snapshot, release manifest, deterministic diff, changelog, migration note, handoff, or release check command. | P1 | RELEASE_GAP | Create deterministic contract:release:prepare and contract:release:check workflows rooted at the verified 1.3 artifact. | RESOLVED |
| PC-020 | Dependency security | `backend/package.json; backend/package-lock.json` | `@nestjs/swagger -> js-yaml` | npm audit reports two production High findings through js-yaml 4.3.0. | P1 | SECURITY_GAP | Upgrade @nestjs/swagger from 11.4.5 to the compatible 11.4.6 fix and rerun the full and production-only audits plus all gates. | RESOLVED |
| PC-021 | OpenAPI quality | `docs/backend-contracts/openapi.yaml` | `Redocly recommended rules` | Redocly reports six warnings: missing license metadata, three operations without 4XX responses, and two unused schemas. | P2 | DOCUMENTATION_DRIFT | Resolve only evidence-backed warnings; do not invent a license or fake responses, and use the narrowest justified suppression where semantics require it. | RESOLVED |
| PC-022 | Documentation | `backend/README.md` | `current runtime totals` | The README contains multiple historical operation and test totals that can be mistaken for current 122-operation status. | P2 | DOCUMENTATION_DRIFT | Mark historical stage evidence explicitly and make the generated current handoff/matrix the only current status pointer. | RESOLVED |
| PC-023 | Production security | `backend/src/common/rate-limit/in-memory-rate-limit.adapter.ts` | `RateLimitPort` | Authentication rate limiting is process-local and resets or diverges across production instances. | P1 | SECURITY_GAP | Replace the production binding with a shared durable implementation and retain an explicit test-only adapter where useful. | RESOLVED |
| PC-024 | Production security | `backend/src/common/rate-limit/qr-join-public-rate-limit.service.ts` | `QrJoinPublicRateLimitService` | Public QR join rate limiting is also process-local and not production-coherent across instances. | P1 | SECURITY_GAP | Move counters to a shared durable boundary with atomic window enforcement and bounded retention. | RESOLVED |
| PC-025 | Operation governance | `backend/runtime-coverage.manifest.json` | `18 implementedDefaultDeny operations` | Runtime coverage proves route presence but does not yet publish the required final completion/visibility/conformance status matrix. | P1 | DOCUMENTATION_DRIFT | Produce a generated operation completion matrix with one allowed state, visibility reason, policy evidence, and conformance coverage per operation. | RESOLVED |
| PC-026 | Error governance | `backend/src/common/errors/error-http-status.ts` | `151 ErrorCode lifecycle rows` | HTTP status is machine-governed, but lifecycle classification is not yet a single machine-readable runtime source. | P1 | BACKEND_DEFECT | Extend the canonical registry with lifecycle and verify contract-only, runtime-only, deprecated, compatibility, and reserved sets. | RESOLVED |
| PC-027 | CI | `.github/workflows/backend-ci.yml` | `backend CI gates` | CI lacks runtime conformance, full compatibility/breaking, release checks, production-only audit, and inventory/report consistency gates. | P1 | CI_GAP | Wire each deterministic command into Backend CI without continue-on-error or weakened thresholds. | RESOLVED |
| PC-028 | GitHub delivery | `.git/config` | `origin and authenticated GitHub browser session` | The checkout initially had no Git remote and no gh executable, so repository identity, default branch, and an authenticated PR mechanism required independent verification before delivery. | P1 | BLOCKED_EXTERNAL | Verified chchaiai/BNBU-Sports-Backend in an authenticated GitHub session, confirmed main as the default branch and 4b4f88b as the published Contract 1.3 commit, then configured that repository as origin. | RESOLVED |
| PC-029 | Generated sources | `backend/src/generated/prisma/**` | `generated @ts-nocheck and any` | Generated Prisma sources contain @ts-nocheck and any by upstream design. | P3 | INTENTIONAL_DESIGN | Retain generated output; verify generator freshness instead of hand-editing it. | RESOLVED |
| PC-030 | Repository scan | `backend/scripts/**; tools/backend-contracts/**; tools/repository/**` | `console output and guard exceptions` | CLI scripts intentionally use console output and throw Error to report deterministic gate failures. | P3 | INTENTIONAL_DESIGN | Retain command-line diagnostics; production HTTP error handling remains separately governed. | RESOLVED |
| PC-031 | Repository scan | `backend/test/**` | `skipped/focused tests` | No describe.skip, it.skip, test.skip, describe.only, it.only, or test.only marker was found in executable backend tests. | P3 | FALSE_POSITIVE | No code change required; retain an automated scan and test-run skip/todo counts. | RESOLVED |
| PC-032 | Docker environment | `external environment` | `Docker Desktop Engine access` | The sandbox identity cannot access the daemon, while the approved unsandboxed interactive identity can access Docker Desktop with an isolated empty DOCKER_CONFIG. | P3 | INTENTIONAL_DESIGN | Run required Docker validation under the verified interactive identity with the task-specific empty configuration; do not read personal Docker credentials or add the sandbox account to docker-users. | RESOLVED |

## Evidence requirements

Every finding includes source evidence, intended resolution, test evidence, and residual risk in `backend-production-closure-inventory.json`. Final closure must replace every pending test statement with an executed command/result and leave no unexplained P0/P1 item.

## Closure totals

- Findings: 32
- Locally open: 0
- Externally blocked: 0
- Resolved/intentional/false positive: 32
- P0: 0
- P1: 26
- P2: 2
- P3: 4
