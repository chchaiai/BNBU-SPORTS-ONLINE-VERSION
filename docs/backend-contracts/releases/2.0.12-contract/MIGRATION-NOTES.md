# Contract 2.0.12 Migration Notes

## Clients

No Android, iOS, or Web API payload change is required. Clients remain bound to the same 126 operations and 288 schemas; only the immutable release version and SHA-256 advance.

## Database

This release adds no Prisma Migration. The existing 20-Migration chain remains authoritative and must still report no pending or drift before deployment. The R01 provisioner uses only the existing schema and the least-privilege runtime identity. It creates or exactly verifies isolated synthetic rows in one serializable transaction, fails closed on any conflicting identity or topology, never updates a pre-existing password, and never deletes history.

## Staging R01 provisioning

The one-shot operator creates or verifies only `ADMIN-01`, `TEACHER-01`, and one non-login internal approval identity under actual organization code `BNBU`; `R01-TEST-ORG` remains a documentation alias only. It requires the reserved `STUDENT-ANDROID-01`, `STUDENT-IOS-01`, and `STUDENT-WEB-01` numbers to be completely absent. During manual R01, each client consumes its own join capability so Backend atomically creates the Student User, Profile, active Enrollment, and AuthSession; the Tester then binds a distinct controlled mailbox and verifies the OTP before using normal Student capabilities. Run the create pass and immediate idempotency pass before any Student scans a code. This is isolated Staging preparation only and does not prove client login, SES delivery, QR scanning, media upload, review, or real-device acceptance.

## Staging secrets

Keep `bnbu_runtime.json`, `bnbu_migrator.json`, `bnbu_staging_fixture.json`, `bnbu_staging_business_fixture.json`, and `bnbu_staging_r01_fixture.json` isolated as separate Docker Compose secrets. The R01 file contains exactly the two Admin/Teacher login identifiers and their distinct passwords; it contains no Student mailbox, OTP, token, or invite value and is mounted only by the R01 one-shot service. The long-running Backend, Migrator, health operator, and business operator never receive it. Mount the complete TencentDB CA chain separately. All host source files use `root:10001` mode `0640`; never place their values in Git, environment files, shell history, logs, reports, or chat. Replace the staging environment template's `APP_VERSION` placeholder with this published release version before preflight.

## Tencent Cloud access

The R01 provisioner does not call COS or SES. Later manual R01 login and media tests continue to use the bound CVM role, the published single-bucket policy, the `SendEmail`-only SES policy, exact Backend HTTPS origins, and COS browser CORS restricted to `https://www.verityai.cn`.

## Deployment boundary

Preparing or publishing this release does not deploy it, start a container, provision an R01 row, modify TencentDB/COS/SES/Nginx, send an OTP, upload an object, or prove external connectivity. Those remain separately evidenced staging operations.
