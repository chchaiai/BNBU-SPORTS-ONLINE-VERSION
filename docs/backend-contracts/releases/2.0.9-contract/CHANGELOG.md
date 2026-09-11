# Contract 2.0.9 Release Changelog

Baseline: immutable `2.0.8-contract` SHA-256 `437398a9fc40ad93e2d8c438c5e3a9353058aac37cbea6f585202b08215dd3c4`.

- Preserves the published 2.0.8-contract snapshot and advances the API surface under the unique `2.0.9-contract` version.
- Corrects the staging health bootstrap audit permission identifier to the database-approved uppercase catalog format.
- Adds forward-only Migration `0020_staging_fixture_audit_action`, expanding the closed AuditLog action catalog with `STAGING_FIXTURE_BOOTSTRAP`.
- Builds and validates the expanded CHECK before replacing the canonical constraint name, without creating tables, rewriting business data, or weakening unknown-action rejection.
- Executes the real create-or-verify bootstrap twice against PostgreSQL in integration tests, proving `CREATED` then `VERIFIED` with one append-only audit fact.
- Adds no client-visible operation or schema change.
