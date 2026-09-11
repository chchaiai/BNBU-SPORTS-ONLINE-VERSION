# Backend Production Closure Validation

Validation date: 2026-08-06 (America/Los_Angeles)

Authoritative source checkout: `C:\Users\23328\Desktop\new_version`

Source branch: `backend/production-closure-contract-governance`

Source commit under validation: `d368aea5671f7507ca7b1cf61bfa05173855db68`

Published baseline: `1.3.0-contract`, SHA-256 `914084874afda2481813a041da4cc01249aa9ea557d9a8bf29baeed4f10e0dc9`

Candidate: `1.4.0-contract`, SHA-256 `c5d18c4894bbe421074cba27da3b39a9076328c499cc742b273665994c29059b`

Synthetic credentials and database URLs were supplied only through process/container environment variables. They are intentionally omitted from this report.

## Final local gate results

| Area | Command or execution | Exit | Pass | Fail | Warnings | Environment |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Repository topology | `npm --prefix backend run repo-layout:check` | 0 | 1 | 0 | 0 | Windows/PowerShell; clients=2, gitlinks=0, nestedGit=0 |
| Inventory | `node tools/backend-contracts/generate-production-closure-inventory.mjs --check` | 0 | 32 findings closed | 0 open | 0 | Windows/Node.js; 579 governed files scanned |
| Format | `npm --prefix backend run format:check` | 0 | 1 | 0 | 0 | Windows/Node.js |
| ESLint | `npm --prefix backend run lint` | 0 | 1 | 0 | 0 | Windows/Node.js; `--max-warnings=0` |
| Strict types | `npm --prefix backend run typecheck` | 0 | 1 | 0 | 0 | Windows/TypeScript |
| Contract aggregate | `npm --prefix backend run contract:check` | 0 | 1 | 0 | 0 unsuppressed | Windows/Node.js; OpenAPI 3.1 |
| Contract parity | `npm --prefix backend run contract:parity:check` | 0 | 122 operations | 0 | 0 | 122 handlers/policies; query DTOs=21; body DTOs=67 |
| Runtime coverage | `npm --prefix backend run runtime-coverage:check` | 0 | 122 operations | 0 | 0 | 104 implemented, 18 fail-closed, 0 not implemented |
| Runtime HTTP conformance | `npm --prefix backend run runtime-conformance:check` | 0 | 463 events | 0 | 0 | Real Nest HTTP E2E + PostgreSQL; success 104/104, error/access 122/122 |
| Compatibility fixtures | `npm --prefix backend run contract:compatibility:check` | 0 | 5 fixtures | 0 | 0 | Direction-aware request/response checks |
| Compatibility candidate | same command | 0 | 74 classified | 0 blockers | 0 | Baseline is immutable Contract 1.3 snapshot |
| Release artifacts | `npm --prefix backend run contract:release:check` | 0 | 10 artifacts | 0 | 0 | Deterministic check detects stale/tampered output |
| Generated artifacts | `npm --prefix backend run generate:check` | 0 | 3 gates | 0 | 0 | Layout, OpenAPI, migration manifest |
| Prisma schema | `npm --prefix backend run db:validate` | 0 | 1 | 0 | 0 | Prisma against PostgreSQL schema |
| Migration safety | `npm --prefix backend run db:migration:check` | 0 | 13 migrations | 0 | 0 | Forward-only migrations `0001` through `0013` |
| Unit | `npm --prefix backend test` | 0 | 109 | 0 | 0 | Node test runner; skipped/todo/focused=0 |
| Contract tests | `npm --prefix backend run test:contract` | 0 | 31 | 0 | 0 | Node test runner; skipped/todo/focused=0 |
| Security tests | `npm --prefix backend run test:security` | 0 | 46 | 0 | 0 | Node test runner; skipped/todo/focused=0 |
| Integration | `npm --prefix backend run test:integration` | 0 | 43 | 0 | 0 | Dedicated Docker PostgreSQL; skipped/todo/focused=0 |
| E2E | `npm --prefix backend run test:e2e` | 0 | 52 | 0 | 0 | Real Nest HTTP + dedicated Docker PostgreSQL; skipped/todo/focused=0 |
| Deprecation trace | targeted exercise-record and score E2E with trace warnings | 0 | 6 | 0 | 0 deprecation warnings | Windows/Node.js + PostgreSQL |
| Build | `npm --prefix backend run build` | 0 | 1 | 0 | 0 | Prisma generate, generated checks, Nest build |
| Full dependency audit | `npm --prefix backend audit --json` | 0 | 639 packages | 0 vulnerabilities | 0 | Windows/npm lockfile |
| Production audit | `npm --prefix backend audit --omit=dev --json` | 0 | 330 packages | 0 vulnerabilities | 0 | Windows/npm lockfile |
| Empty database migration | `npm --prefix backend run db:migrate:deploy` | 0 | 13 applied | 0 | 0 | Docker PostgreSQL 17; dedicated empty database |
| Repeat deployment | same deploy command on migrated database | 0 | no pending | 0 | 0 | Docker PostgreSQL 17 |
| Schema drift | `npm --prefix backend run db:schema:drift:check` | 0 | no difference | 0 | 0 | Docker PostgreSQL 17 |
| Runtime image | no-cache Docker build of backend runtime target | 0 | image `6a7ed5a737b5` | 0 | 2 notices | Docker Engine 29.6.2; legacy builder and npm lifecycle allow-script notices only |
| Migrator image | no-cache Docker build of backend migrator target | 0 | image `16b8d6045cee` | 0 | 2 notices | Docker Engine 29.6.2; audits remained zero |
| Migrator runtime | migrator image against dedicated empty database | 0 | 13 migrations + hardening | 0 | 0 | PostgreSQL; runtime role cannot mutate migration history |
| Runtime smoke | runtime image with synthetic config | 0 | live=200, ready=200, healthy | 0 | 0 | Non-root `bnbu` user; exact candidate image |
| Graceful shutdown | `docker stop --time 10` | 0 | exit=0, OOM=false | 0 | 1 notice | Docker recommends the renamed `--timeout` flag |
| Diff hygiene | `git diff --check` | 0 | 1 | 0 | 0 | Root monorepo |

## Environment evidence

- Windows identity: `laptop-v69h45g8\23328`.
- Docker client/server: 29.6.2; Docker Desktop 4.85.0; Linux Engine; context `default`.
- Docker was invoked by the same identity with an isolated empty configuration directory at `C:\tmp\bnbu-production-closure-docker-config`; no personal Docker credentials were read or copied.
- PostgreSQL test container: `bnbu-production-closure-postgres`, bound to loopback port 55432.
- Runtime image tag: `bnbu-sports-backend:production-closure-d368aea`.
- Migrator image tag: `bnbu-sports-backend-migrator:production-closure-d368aea`.
- The successful runtime container was stopped cleanly after live/ready checks. The dedicated PostgreSQL container remains test-only and contains no real user data.

## Resolved failures observed during implementation

The final results above are clean reruns. Earlier runs exposed and then verified fixes for five missing success-conformance fixtures, one integration fixture-policy violation, one stale unit assertion, one stale contract reference-count assertion, and one runtime smoke setup error caused by generating synthetic keys from the wrong working directory. The first container correctly failed fast for missing required configuration; no production validation was weakened.

## GitHub validation

The authoritative public repository, default branch, and published baseline commit were verified before push. The non-draft PR is [#4](https://github.com/chchaiai/BNBU-Sports-Backend/pull/4), base `main`, head `backend/production-closure-contract-governance`. Backend CI completed successfully for both the push event (run `31149390201`, 6m20s) and pull-request event (run `31149449037`, 5m09s). Each `foundation` job executed the full PostgreSQL test stack, both audits, no-cache runtime/migrator Docker builds, and whitespace check.

Both successful runs emitted one non-blocking GitHub runner annotation: `actions/checkout@v4` and `actions/setup-node@v4` still target Node.js 20 and are currently forced to Node.js 24. This is tracked as P2 action-toolchain maintenance; it did not weaken or bypass any gate. The final documentation-only update is required to pass the same push and pull-request workflows before the closure verdict is delivered.
