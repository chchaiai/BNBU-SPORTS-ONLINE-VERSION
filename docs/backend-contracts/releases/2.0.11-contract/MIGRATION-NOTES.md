# Contract 2.0.11 Migration Notes

## Clients

No Android, iOS, or Web API payload change is required. Clients remain bound to the same 126 operations and 288 schemas; only the immutable release version and SHA-256 advance.

## Database

This release adds no Prisma Migration. The existing 20-Migration chain remains authoritative and must still report no pending or drift before deployment. The operator-only correction changes the expected evidence state, not the domain state machine, runtime route behavior, or persisted schema.

## Staging business closure

The one-shot operator now requires the persisted JoinCapability evidence to be `ACTIVE`, which is the state created by the accepted Migration and used by the domain and E2E flow. The 2.0.10 operator stopped fail closed before joining because it expected obsolete `ISSUED` evidence; retry is permitted only after the published 2.0.11 image is deployed. The operator continues to use isolated synthetic staging data, sends one real SES code to a controlled test mailbox, and leaves append-only database and private COS evidence. This is staging evidence only and does not replace Android/iOS real-device acceptance or a production media scanner.

## Nginx request IDs

The API and same-origin Web proxy preserve an inbound `X-Request-ID` only when it matches the Backend contract `^[A-Za-z0-9._:-]{1,64}$`. All other values use an Nginx-generated fallback. The same canonical value is forwarded to the Backend and recorded in the API access log, while invite-token path redaction remains in force.

## Staging secrets

Keep `bnbu_runtime.json`, `bnbu_migrator.json`, `bnbu_staging_fixture.json`, and `bnbu_staging_business_fixture.json` isolated as separate Docker Compose secrets. The business fixture file contains exactly `STAGING_BUSINESS_ADMIN_PASSWORD`, `STAGING_BUSINESS_TEACHER_PASSWORD`, and `STAGING_BUSINESS_STUDENT_EMAIL`, and is mounted only by the one-shot business operator. The long-running Backend, Migrator, and health operator never receive it. Mount the complete TencentDB CA chain separately. All host source files use `root:10001` mode `0640`; never place their values in Git, environment files, shell history, logs, reports, or chat. Replace the staging environment template's `APP_VERSION` placeholder with this published release version before preflight.

## Tencent Cloud access

COS credentials are obtained from the bound CVM role and remain scoped to the published single-bucket policy. SES uses the same bound role with the `SendEmail`-only policy. Backend CORS is frozen to the exact admin/www HTTPS origins, while COS browser CORS remains restricted to `https://www.verityai.cn`. The operator's real delivery and object upload are deployment verification steps and intentionally leave append-only synthetic evidence.

## Deployment boundary

Publishing this release does not deploy it, start a container, modify TencentDB/COS/SES/Nginx, send an OTP, upload an object, or prove external connectivity. Those remain separately evidenced staging operations.
