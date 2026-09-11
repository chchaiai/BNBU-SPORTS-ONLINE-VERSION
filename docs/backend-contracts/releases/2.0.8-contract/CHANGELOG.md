# Contract 2.0.8 Release Changelog

Baseline: immutable `2.0.7-contract` SHA-256 `24967f0ec3f054ccde4aa7843c9b89e750fd2fd3bd237467b6665496301491cb`.

- Preserves the published 2.0.7-contract snapshot and advances the API surface under the unique `2.0.8-contract` version.
- Rejects every HTTP CORS origin in staging and production and reserves a non-routable `.invalid` sentinel until the exact deployed Web HTTPS origin is known.
- Adds an operations-only, create-or-verify synthetic ADMIN bootstrap for authenticated staging health verification; conflicts fail closed without overwriting data.
- Verifies authenticated admin health over the private Compose network, checks request ID and all dependency states, and logs out without printing tokens.
- Keeps the fixture password in a dedicated Compose secret that is never mounted by the long-running Backend or Migrator.
- Adds no database migration and no client-visible operation or schema change.
