# Contract 2.0.6 Release Changelog

Baseline: immutable `2.0.5-contract` SHA-256 `86b2607e0922c70d4e7c7866f4578952babc103e57daa14f42c3b4619b34ccf8`.

- Preserves the published 2.0.5-contract snapshot and advances the API surface under the unique `2.0.6-contract` version.
- Makes every artifact copied into the non-root migrator image explicitly owned by `node:node`, including package metadata, Prisma schema and migrations, TLS/secret bootstrap scripts, hardening logic, dependencies, and generated Prisma Client.
- Keeps mode-protected server build contexts readable by the migrator without widening host permissions or running the container as root.
- Retains the persistent complete TencentDB CA chain and CA/host identity verification added in 2.0.5-contract.
- Keeps the Backend application port bound to loopback in the staging Compose and retains Nginx as the future public entry point.
- Adds no database migration and no client-visible operation or schema change.
