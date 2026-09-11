# Contract 2.0.10 Migration Notes

## Clients

No Android, iOS, or Web API payload change is required. Clients remain bound to the same 126 operations and 288 schemas; only the immutable release version and SHA-256 advance.

## Database

This release adds no Prisma Migration. The Phase 12 operator creates or verifies only deterministic, isolated synthetic staging rows through the existing least-privilege runtime identity. It never resets the database, rewrites a conflicting fixture, deletes history, or performs cleanup. The existing 20-Migration chain remains authoritative and must still report no pending or drift before deployment.

## Staging business closure

The one-shot operator uses the exact public staging API and validates Authentication, refresh rotation/reuse rejection, QR enrollment, session replay/stale-version rejection, real private COS upload and `TEST_SIGNATURE` processing, record submission, VALID/INVALID review history, student-safe projections, score derivation, audit facts, and idempotency evidence. It sends one real SES code to a controlled test mailbox and requires hidden TTY input. This is staging evidence only and does not replace Android/iOS real-device acceptance or a production media scanner.

## Staging secrets

Keep `bnbu_runtime.json`, `bnbu_migrator.json`, `bnbu_staging_fixture.json`, and `bnbu_staging_business_fixture.json` isolated as separate Docker Compose secrets. The business fixture file contains exactly `STAGING_BUSINESS_ADMIN_PASSWORD`, `STAGING_BUSINESS_TEACHER_PASSWORD`, and `STAGING_BUSINESS_STUDENT_EMAIL`, and is mounted only by the one-shot business operator. The long-running Backend, Migrator, and health operator never receive it. Mount the complete TencentDB CA chain separately. All host source files use `root:10001` mode `0640`; never place their values in Git, environment files, shell history, logs, reports, or chat. Replace the staging environment template's `APP_VERSION` placeholder with this published release version before preflight.

## Tencent Cloud access

COS credentials are obtained from the bound CVM role and remain scoped to the published single-bucket policy. SES uses the same bound role with the `SendEmail`-only policy. Backend CORS is frozen to the exact admin/www HTTPS origins, while COS browser CORS remains restricted to `https://www.verityai.cn`. The operator's real delivery and object upload are deployment verification steps and intentionally leave append-only synthetic evidence.

## Deployment boundary

Publishing this release does not deploy it, start a container, modify TencentDB/COS/SES/Nginx, send an OTP, upload an object, or prove external connectivity. Those remain separately evidenced staging operations.
