# Contract 2.0.7 Release Changelog

Baseline: immutable `2.0.6-contract` SHA-256 `099e7abbac3d7e3ce4f3a928d6863cd2486f4e957ae6be7b950c88384e45ce79`.

- Preserves the published 2.0.6-contract snapshot and advances the API surface under the unique `2.0.7-contract` version.
- Pins PostgreSQL certificate identity verification to the actual host parsed from the runtime or migration URL, including TencentDB private IP addresses.
- Prevents `node-postgres` from substituting `localhost` during IP-address certificate checks while retaining `rejectUnauthorized: true` and the complete TencentDB CA chain.
- Applies the same strict host check to the Runtime Prisma pool and the Migrator runtime-permission hardening client.
- Keeps the Backend application port bound to loopback in the staging Compose and retains Nginx as the future public entry point.
- Adds no database migration and no client-visible operation or schema change.
