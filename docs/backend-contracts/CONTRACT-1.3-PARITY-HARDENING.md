# Contract 1.3 Parity Hardening Report

## 1. Baseline

- Branch: `backend/contract-1.3-parity-hardening`
- Starting HEAD: `57000801cf67fb07b739ca8d71cc7f080543d186`
- Starting commit: `feat(backend): publish Stage 21 client capabilities`
- Repository layout check: passed; `backend/`, Android, and Web remain ordinary directories in the single root repository.
- Initial worktree exception: user-owned `AGENTS.md` was already modified. It was preserved, never edited by this phase, and is excluded from staging and the phase commit.
- Baseline validation passed: contract check, runtime coverage, generated-artifact check, format, lint, and strict typecheck.

The current contract was re-audited as OpenAPI 3.1.0, `1.3.0-contract`, base path `/api/v1`, 104 paths, 122 operations, and 275 schemas. Controller and policy coverage was revalidated at 122 handlers and 122 `@OperationPolicy` mappings, with no missing or extra operation mapping.

## 2. Published Contract 1.3 identity

| Item | Verified value |
| --- | --- |
| Canonical local file | `docs/backend-contracts/openapi.yaml` |
| OpenAPI version | `3.1.0` |
| Contract version | `1.3.0-contract` |
| SHA-256 | `914084874afda2481813a041da4cc01249aa9ea557d9a8bf29baeed4f10e0dc9` |
| File size | 298,422 bytes |
| Starting local Git commit | `57000801cf67fb07b739ca8d71cc7f080543d186` |
| Git blob | `f658dbdef3bef4e05489745560a033dbd5f2dac6` |
| GitHub published branch commit | `4b4f88b69fb2c3e07e7401650e0107360dd28b12` on `codex/backend-openapi-1-3-ios-auth-exemption` |
| Local/published artifact relationship | Byte-for-byte SHA-256 and Git-blob identity confirmed |
| Git tag | No local or GitHub tag found |
| GitHub release metadata | The repository release and tag pages contain no 1.3 release object; default `main` still advertises 1.1 |

The user-confirmed GitHub publication is therefore verified as a frozen GitHub branch artifact, not as a GitHub Release or tag. This phase does not create, overwrite, or reinterpret release metadata. The canonical OpenAPI file is unchanged.

## 3. Initial mismatch inventory

The audit covered public path/query/header inputs, request bodies, DTO decorators and transformer mappings, controllers, ValidationPipe behavior, service consumption, success statuses, the error envelope, the governed error catalog, runtime error construction, and cursor semantics.

The normalized inventory contained 71 confirmed granular review records: 55 `BACKEND_DRIFT` records and 16 `CONTRACT_DEFECT` records. Two additional heuristic candidates were classified `FALSE_POSITIVE` and excluded from those 71 records. Repetitive missing/extra pairs for one rename are normalized to one root drift per operation; the parity tool itself reports the underlying field-level differences.

- The input/status pass found DTO name, nullability, enum, extra-field, and POST-status drift, plus 15 static contract defects.
- The supplemental runtime pass found noncanonical error call sites, missing governed runtime error entries/messages, three accepted-but-ignored score cursors, and the score-status semantic defect.
- No active consumer evidence justified retaining the backend-only `search` alias.
- No database change or migration was needed.

## 4. Classification of every mismatch

Repeated fields are grouped below by one remediation and one regression mechanism; the named operations and fields define the complete scope of each group.

| Finding | Classification | Resolution | Regression Gate |
| ------- | -------------- | ---------- | --------------- |
| `q` versus `search` in `listRosterEntries`, `listRosterAlignmentResults`, and `listExerciseRecords` | `BACKEND_DRIFT` | Public DTOs and services now use only Contract 1.3 `q`; strict validation rejects undeclared `search` | Query field-name parity plus DTO validation test |
| Optional but non-null Contract fields accepted `null`: `UpdateStudentRequest` (`fullName`, `gender`, `gradeYear`), `UpdateCourseRequest` (`courseName`, `status`), class-section create/update fields, exercise-record update fields, feedback context, exemption update fields, and optional location numbers | `BACKEND_DRIFT` | Replaced null-skipping `IsOptional` with undefined-only `ValidateIf`; fields explicitly nullable in Contract remain nullable | Recursive body required/type/nullable parity |
| `UpdateStudentRequest.gender` exposed internal `UNSPECIFIED` | `BACKEND_DRIFT` | Public request enum narrowed to `MALE`, `FEMALE`, `OTHER`; internal persistence state remains unchanged | Body enum parity and runtime validation test |
| `listScoreAdjustments` reused a DTO exposing undeclared `classSectionId`, `enrollmentId`, and `status` | `BACKEND_DRIFT` | Added an operation-specific public DTO containing only `cursor` and `limit` | Backend-only query-field detection |
| `listAuditLogs.action` used an open regex instead of the governed 43-value vocabulary | `BACKEND_DRIFT` | Public DTO now validates the exact Contract enum | Query enum parity |
| `appendExerciseLocationSamples` and `finalizeExerciseLocationTrack` inherited Nest POST 201 instead of Contract 200 | `BACKEND_DRIFT` | Added explicit `@HttpCode(200)` | AST success-status parity plus runtime metadata test |
| Governed codes were absent from runtime messages/type coverage | `BACKEND_DRIFT` | Added the 11 missing governed codes and messages | Catalog/registry/message set equality |
| Noncanonical statuses at 12 runtime error-use records, including the audited auth, roster, review, media, and alignment codes | `BACKEND_DRIFT` | Corrected call sites and made `ApplicationError` reject a status different from the canonical registry | Catalog-to-registry and every literal call-site status comparison; runtime constructor test |
| `listScoreRules`, `listStudentScores`, and `listScoreAdjustments` accepted cursor fields without applying them | `BACKEND_DRIFT` | Added resource-bound cursor decode/encode, `limit + 1`, `hasMore`, and `nextCursor` behavior | Unit/integration/contract layers plus query parity |
| Open `sort` on 12 list operations, including three score sorts with no approved ordering semantics | `CONTRACT_DEFECT` | Kept safe endpoint whitelists; did not invent score ordering; recorded exact static exceptions | Stale/changed exception keys fail the parity gate |
| Open `listClassSections.status` versus closed class-section state | `CONTRACT_DEFECT` | Preserved the domain enum and proposed next-version schema correction | Exact static exception ledger |
| Shared `captureSource` includes `SYSTEM_IMPORT` although the upload operation excludes it | `CONTRACT_DEFECT` | Preserved public upload safety; proposed endpoint-specific enum | Exact static exception ledger |
| `MediaAccessRequest.purpose` is pattern-open while runtime supports only `VIEW_ORIGINAL` | `CONTRACT_DEFECT` | Preserved auditable safe value; proposed named enum | Exact static exception ledger |
| `listStudentScores.status` collapses calculation, publication, lock, and revision semantics | `CONTRACT_DEFECT` | Did not guess a filter; documented two versioned corrections and recommended orthogonal filters | Semantic-debt ledger is printed by the gate; runtime response semantics remain a stated limitation |
| Logout response union initially appeared to have an extra body property | `FALSE_POSITIVE` | Schema-union resolution confirmed the property is valid; no code change | Recursive schema resolver fixture coverage |
| Export filter object initially appeared backend-only | `FALSE_POSITIVE` | Nested request-schema resolution confirmed it is declared; no code change | Recursive nested-body parity |
| Documentation-only mismatch requiring a derived-document correction | `DOCUMENTATION_DRIFT` | None confirmed | Not applicable |
| Active legacy consumer requiring a compatibility alias | `INTENTIONAL_COMPATIBILITY` | None confirmed | Strict undeclared-field rejection retained |
| Business decision that could not be classified | `BLOCKED_DECISION` | None; score status is a confirmed contract defect with correction approval pending | Errata review, not guessed runtime behavior |

## 5. Backend fixes

The backend now consumes Contract 1.3 request names, rejects public DTO fields and enum values not declared by the contract, distinguishes omission from explicit null, returns the two audited POST success codes, and applies score cursors. Error handling now has one governed direction: the 151-code governance catalog maps to a 151-code runtime registry, which maps to `ApplicationError`; a call site cannot freely choose a different HTTP status. Historical error snapshots are restored with the canonical status rather than perpetuating an old mismatch.

The implementation does not add endpoints, permissions, domain states, migrations, client behavior, or compatibility aliases.

## 6. Contract defects / errata

Contract 1.3 remains frozen. The 16 known defect records comprise 15 static exceptions and one semantic limitation. The detailed analysis, compatibility impact, next-version correction, and breaking-change classification are in `CONTRACT-1.3-ERRATA-PROPOSAL.md`.

Backend conformance cannot honestly be marked complete while these defects remain in the frozen contract. The safest current runtime behavior is deliberately retained rather than widening validation or inventing score filtering semantics.

## 7. New parity gate design

`npm run contract:parity:check` parses the canonical YAML directly; it does not create a second API contract. It uses the TypeScript AST to associate all 122 `@OperationPolicy` handlers with their public query/body DTOs and recursively inspects nested DTOs.

The gate checks:

- query and request-body field names, requiredness, basic type, enum, nullability, and backend-only/contract-only fields;
- legal `@Expose({ name })` mappings while treating `@Transform` as a value transform rather than an implicit rename;
- Nest default success status behavior, explicit `@HttpCode`, DELETE/default-deny handlers, and the single declared success status per operation;
- the governed 151-code catalog, canonical runtime registry, application error messages, and 536 runtime `ApplicationError` call sites;
- exact known Contract 1.3 exception keys, so a repaired or moved exception becomes stale and fails instead of silently accumulating.

The gate's isolated self-test covers six scenario groups: query rename; missing and extra DTO fields; enum expansion and contraction; requiredness; 200/201 success mismatch; and conflicting status use for the same ErrorCode. Repository unit tests additionally exercise actual DTO validation, controller metadata, and runtime error enforcement.

Current gate result:

```text
Contract parity: PASS (operations=122, handlers=122, query=21, body=67)
Error parity: catalog=151, registry=151, messages=151, callSites=536
Frozen 1.3 contract defects: 16 (staticExceptions=15, semanticLimitations=1)
```

## 8. CI integration

The new command is registered in `backend/package.json` and runs automatically in `.github/workflows/backend-ci.yml` after the existing contract check and before runtime-coverage and generated-artifact checks. A parity failure returns a nonzero exit code and therefore fails the backend CI job.

Existing OpenAPI validation, generated-artifact checks, contract tests, and runtime-coverage checks remain in place.

## 9. Test results

The final pre-commit verification used repository commands and synthetic PostgreSQL data only. Final clean-HEAD gate reruns are recorded after the phase commit.

| Command / check | Exit | Passed | Failed | Warnings / notes |
| --- | ---: | ---: | ---: | --- |
| `npm run repo-layout:check` | 0 | 1 check | 0 | None |
| `npm run contract:check` | 0 | 122 operations | 0 | 6 pre-existing Redocly warnings: missing license, three public operations without 4xx, two unused schemas |
| `npm run contract:parity:check` | 0 | 122 handlers; 151 error codes; 536 call sites | 0 | 16 frozen defect records are explicitly reported, not hidden |
| `npm run runtime-coverage:check` | 0 | 122 operations | 0 | 104 implemented and 18 stable default-deny operations |
| `npm run generate:check` | 0 | 3 checks | 0 | None |
| `npm run format:check` | 0 | all checked files | 0 | None |
| `npm run lint` | 0 | all configured sources/tests/scripts | 0 | No warnings allowed |
| `npm run typecheck` | 0 | 1 project | 0 | Strict no-emit check |
| `npm test` | 0 | 109 | 0 | 0 skipped/todo |
| `npm run test:contract` | 0 | 31 | 0 | 0 skipped/todo |
| `npm run test:security` | 0 | 46 | 0 | 0 skipped/todo |
| `npm run test:integration` | 0 | 41 | 0 | Final run used an explicit migrated test database; 0 skipped/todo |
| `npm run test:e2e` | 0 | 47 | 0 | Two Node/PostgreSQL query-queue deprecation warnings; 0 skipped/todo |
| `npm run db:validate` | 0 | 1 schema | 0 | Synthetic database URL only |
| `npm run db:migration:check` | 0 | 12 migrations | 0 | No migration changed or added |
| `npm run db:migrate:deploy` then repeat | 0 | 12 applied; repeat clean | 0 | Synthetic test database |
| `npm run db:schema:drift:check` | 0 | no schema difference | 0 | Synthetic test database |
| `npm run build` | 0 | 1 build | 0 | Also executed by E2E pretest |
| Runtime Docker image, no-cache build | 0 | 1 image | 0 | `npm ci` reported two high dependency advisories; legacy Docker builder deprecation |
| Migrator Docker image, no-cache build | 0 | 1 image | 0 | Same dependency and builder warnings |
| Container runtime smoke | 0 | live 200; ready 200; container healthy | 0 | Runtime user `bnbu`; synthetic PostgreSQL only |
| `npm audit --audit-level=high` | 1 | 0 advisories at/above threshold | 2 high vulnerabilities | `js-yaml` GHSA-5p4m-2wfm-xmqj; npm offers only `--force` remediation outside the declared `@nestjs/swagger` range, so it was not applied |
| `git diff --check` | 0 | 1 diff check | 0 | Line-ending conversion notices are informational; no whitespace error |

Diagnostic attempts are not counted as final passes: integration first failed without `TEST_DATABASE_URL`, then correctly rejected a database name lacking `test`, then failed before migrations existed. E2E initially exposed two stale expected statuses and passed after those assertions were aligned to the frozen governed catalog. A direct build first failed closed without `MIGRATION_DATABASE_URL` and then passed with a synthetic value. The sandboxed audit request could not reach the npm advisory endpoint; the required external read-only retry produced the two-high result above. No test was skipped, deleted, weakened, or forced.

The task-created app/PostgreSQL containers, empty Docker configuration, smoke env file, and two validation images were removed after the smoke test. The removed database contained only synthetic task data and is not recoverable; no user Docker data or personal Docker configuration was touched.

## 10. Remaining limitations

1. The frozen contract retains the 15 static defects listed in the errata proposal; the backend deliberately keeps safer closed behavior.
2. `listStudentScores.status` is accepted but not semantically applied because Contract 1.3 does not define a safe mapping to the approved revision/publication/lock model.
3. The gate statically checks public inputs, success statuses, and governed error construction. It does not prove service-level use of every non-cursor filter.
4. Full runtime response-body OpenAPI conformance is out of scope and is not claimed.
5. Full API diff/breaking-change comparison and contract release automation remain separate future phases.
6. GitHub has no 1.3 tag or Release object; linkage is to the verified published branch artifact.
7. Dependency advisories and the Redocly warnings are surfaced in verification and are not suppressed by this phase.

## 11. Files changed

- CI and command registration: `.github/workflows/backend-ci.yml`, `backend/package.json`.
- Gate and tests: `backend/scripts/check-contract-parity.mjs`, `backend/test/unit/contract-parity-gate.test.ts`.
- Error governance: `backend/src/common/errors/error-http-status.ts`, `backend/src/common/errors/application-error.ts`, and corrected backend error call sites.
- Public input/runtime alignment: backend DTOs, the three `q` service consumers, two location handlers, and score cursor service/controller/application files.
- Corrected E2E expectations: auth-disabled and unsupported-roster-source assertions.
- Reports: this file and `CONTRACT-1.3-ERRATA-PROPOSAL.md`.

No `docs/backend-contracts/openapi.yaml`, generated artifact, migration, Android, Web, iOS, or user-owned `AGENTS.md` change belongs to this phase.

## 12. Final verdict

```text
Backend implementation conforms to published Contract 1.3: PARTIAL
Future Backend/OpenAPI drift is automatically gated: PARTIAL
```

Backend conformity is partial only because a contradictory or underspecified frozen contract cannot be fully implemented without unsafe widening or an unapproved semantic rule. All confirmed backend-owned drift in this phase is fixed; the remaining 16 records are Contract defects.

Automatic gating is partial because it now covers the audited input DTO surface, success status, and error-code/status construction, but it does not yet provide runtime response-body conformance, universal service-semantic filter verification, full API diff, or a breaking-change/release gate.
