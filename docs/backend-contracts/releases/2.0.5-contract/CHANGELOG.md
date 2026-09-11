# Contract 2.0.5 Release Changelog

Baseline: immutable `2.0.4-contract` SHA-256 `fb58079a167a1ac6208618bc1b2ac106f618a53be5418936992c1ddf36e85b47`.

- Preserves the published 2.0.4-contract snapshot and advances the API surface under the unique `2.0.5-contract` version.
- Mounts a persistent complete TencentDB CA chain into both non-root staging containers while preserving strict separation between the runtime and migrator JSON files.
- Enforces CA and host identity validation for runtime `PrismaPg`, Prisma migration, and post-migration PostgreSQL hardening connections without placing certificate content in an image or JSON secret.
- Keeps the Backend application port bound to loopback in the staging Compose and retains Nginx as the future public entry point.
- Adds no database migration and no client-visible operation or schema change.
