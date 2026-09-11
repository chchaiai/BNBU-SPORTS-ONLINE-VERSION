# Contract 2.0.12 Release Changelog

Baseline: immutable `2.0.11-contract` SHA-256 `c3bdba5999404ea5c58b48407f582ed7b6f19fe955b793f5dfba78303ae9edb1`.

- Preserves the published 2.0.11-contract snapshot and advances the immutable contract release under the unique `2.0.12-contract` version without changing the API surface.
- Adds a secret-isolated, staging-only R01 provisioner for the fixed `BNBU` organization boundary, `R01-TEST-COURSE-A`, `R01-TEST-SECTION-A`, the two approved Admin/Teacher aliases, and the non-login internal approver.
- Uses one serializable create-or-verify transaction, refuses conflicting pre-existing identities or topology, and never overwrites passwords, changes existing rows, or deletes history.
- Requires all three reserved Student numbers to remain absent so Android, iOS, and Student Web must exercise the real QR join, automatic identity creation, contact binding, and OTP activation flow during R01.
- Adds a dedicated hardened Compose one-shot service with exact TencentDB runtime/TLS, confirmation, Secret schema, resource, and log-rotation guards; it does not replace the long-running Backend or run Migrator.
- Adds no client-visible operation or schema change.
