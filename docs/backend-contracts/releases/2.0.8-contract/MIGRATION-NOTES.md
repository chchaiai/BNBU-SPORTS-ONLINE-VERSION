# Contract 2.0.8 Migration Notes

## Clients

No Android, iOS, or Web API payload change is required. Clients remain bound to the same 126 operations and 288 schemas; only the immutable release version and SHA-256 advance.

## Database

This release adds no Prisma migration. Staging still requires a dedicated business database, a schema-admin migration account, and a separate least-privilege runtime account. Creating the database is infrastructure preparation; applying the existing migration chain remains a separately authorized deployment phase.

## HTTPS-only CORS

Staging and production accept exact HTTPS origins only. Before a real Web deployment origin is verified, keep `CORS_ALLOWLIST=https://web-origin-not-configured.invalid`; this reserved sentinel does not grant a reachable browser origin. Do not restore the retired public-IP HTTP origin. Configure the exact Web HTTPS origin in Backend and COS only during Phase 11.

## Staging secrets

Mount `bnbu_runtime.json`, `bnbu_migrator.json`, and `bnbu_staging_fixture.json` as separate Docker Compose secrets. The fixture file contains only `STAGING_ADMIN_PASSWORD` and is mounted only by the one-shot operations profile; Backend and Migrator never receive it. Mount the complete TencentDB intermediate and root CA chain at `/run/secrets/tencentdb-ca-chain.pem`. All four host source files use `root:10001` mode `0640`; do not add interactive host users to that group. Do not duplicate managed keys in the container environment. Replace the staging environment template's `APP_VERSION` placeholder with this published release version before preflight.

## Tencent Cloud access

COS credentials are obtained from the bound CVM role and must be scoped by the published single-bucket policy. SES uses the bound role and the `SendEmail`-only policy. Cloud policy association, bucket access, template acceptance, and actual delivery remain deployment verification steps.

## Deployment boundary

Publishing this release does not deploy it, start a container, run a TencentDB migration, modify Nginx, or prove external COS or SES connectivity.
