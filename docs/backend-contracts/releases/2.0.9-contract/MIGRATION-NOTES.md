# Contract 2.0.9 Migration Notes

## Clients

No Android, iOS, or Web API payload change is required. Clients remain bound to the same 126 operations and 288 schemas; only the immutable release version and SHA-256 advance.

## Database

This release adds forward-only Prisma Migration `0020_staging_fixture_audit_action`. It adds and validates an expanded `audit_logs_action_type_check_v2`, drops the narrower prior CHECK, and renames the validated replacement to the canonical `audit_logs_action_type_check`. It creates no table, deletes no row, and changes no client data shape. Apply it with the schema-admin Migrator before running the staging fixture bootstrap; the runtime account remains separate and least-privilege.

## Staging health audit catalog

The bootstrap emits `STAGING_FIXTURE_BOOTSTRAP` with permission `OPERATIONS-STAGING-FIXTURE-BOOTSTRAP`. Both identifiers now satisfy the closed PostgreSQL constraints. Unknown actions remain rejected and AuditLog remains append-only. The bootstrap still creates or verifies only the isolated synthetic organization and ADMIN; conflicts fail closed without overwriting data.

## Staging secrets

Mount `bnbu_runtime.json`, `bnbu_migrator.json`, and `bnbu_staging_fixture.json` as separate Docker Compose secrets. The fixture file contains only `STAGING_ADMIN_PASSWORD` and is mounted only by the one-shot operations profile; Backend and Migrator never receive it. Mount the complete TencentDB intermediate and root CA chain at `/run/secrets/tencentdb-ca-chain.pem`. All four host source files use `root:10001` mode `0640`; do not add interactive host users to that group. Do not duplicate managed keys in the container environment. Replace the staging environment template's `APP_VERSION` placeholder with this published release version before preflight.

## Tencent Cloud access

COS credentials are obtained from the bound CVM role and must be scoped by the published single-bucket policy. SES uses the bound role and the `SendEmail`-only policy. Cloud policy association, bucket access, template acceptance, and actual delivery remain deployment verification steps.

## Deployment boundary

Publishing this release does not deploy it, start a container, run a TencentDB migration, modify Nginx, or prove external COS or SES connectivity.
