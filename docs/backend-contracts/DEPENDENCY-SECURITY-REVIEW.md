# Dependency Security Review

Review date: 2026-08-06 (America/Los_Angeles). Scope: `backend/package-lock.json`.

## Result

| Check                        | Result                                   |
| ---------------------------- | ---------------------------------------- |
| Full locked dependency audit | 0 critical / 0 high / 0 moderate / 0 low |
| Production-only audit        | 0 critical / 0 high / 0 moderate / 0 low |
| Production dependencies      | 330                                      |
| Total dependency graph       | 639                                      |

Commands executed against the npm advisory service:

```text
npm audit --json
npm audit --omit=dev --json
```

Both returned exit code 0 with an empty `vulnerabilities` object. No audit level was lowered and `npm audit fix --force` was not used.

## `js-yaml` investigation

`npm explain js-yaml` and `npm ls js-yaml` identify two chains:

- Production: `@nestjs/swagger@11.4.6` requested `js-yaml@5.2.1`; a scoped package override pins `js-yaml@5.2.3`.
- Development only: `@nestjs/cli -> fork-ts-checker-webpack-plugin -> cosmiconfig -> js-yaml@4.3.1`.

The Swagger upgrade and scoped override remove the previously reported high advisories while keeping the override limited to the affected upstream package. OpenAPI generation, Redocly validation, unit, contract, E2E, build, and Docker checks validate compatibility.

## PostgreSQL driver compatibility

`@prisma/adapter-pg@7.9.1` declares `pg ^8.16.3`. The direct dependency is fixed at `pg@8.16.3` because `pg@8.22.0` emits a pg@9 queue-removal deprecation from Prisma's transaction interpreter. The supported fixed version removes that unresolved warning; database integration, concurrency, migration, drift, E2E, build, Docker, and both dependency audits remain mandatory gates.

## Residual risk and update condition

No known locked-package vulnerability remains. The two compatibility pins must be reviewed when a newer `@nestjs/swagger` or `@prisma/adapter-pg` release removes the need for them; they must not be deleted without the same full test and audit evidence.
