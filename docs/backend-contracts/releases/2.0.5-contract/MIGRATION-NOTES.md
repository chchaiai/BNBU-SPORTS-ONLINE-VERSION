# Contract 2.0.5 Migration Notes

## Clients

No Android, iOS, or Web API payload change is required. Clients remain bound to the same 126 operations and 288 schemas; only the immutable release version and SHA-256 advance.

## Database

This release adds no Prisma migration. Staging still requires a dedicated business database, a schema-admin migration account, and a separate least-privilege runtime account. Creating the database is infrastructure preparation; applying the existing migration chain remains a separately authorized deployment phase.

## Staging secrets

Mount `bnbu_runtime.json` and `bnbu_migrator.json` as separate Docker Compose secrets. The runtime file contains only runtime-managed keys; the migrator file contains only `MIGRATION_DATABASE_URL`. Mount the complete TencentDB intermediate and root CA chain at `/run/secrets/tencentdb-ca-chain.pem` in both containers. On the Compose host, all three source files must be owned by `root:10001` with mode `0640`; do not add interactive host users to that group. Do not duplicate managed keys in the container environment. Replace the staging environment template's `APP_VERSION` placeholder with this published release version before preflight.

## Tencent Cloud access

COS credentials are obtained from the bound CVM role and must be scoped by the published single-bucket policy. SES uses the bound role and the `SendEmail`-only policy. Cloud policy association, bucket access, template acceptance, and actual delivery remain deployment verification steps.

## Deployment boundary

Publishing this release does not deploy it, start a container, run a TencentDB migration, modify Nginx, or prove external COS or SES connectivity.
