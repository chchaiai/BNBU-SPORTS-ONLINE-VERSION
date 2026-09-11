# Contract 2.0.4 Release Changelog

Baseline: immutable `2.0.3-contract` SHA-256 `382bc0bdffe872b8695d3d503ca0957cc95ff5ea8b786958cf62bd277edda7a2`.

- Preserves the published 2.0.3-contract snapshot and advances the API surface under the unique `2.0.4-contract` version.
- Grants both non-root staging containers supplemental GID `10001` so Docker Compose file-backed secrets are readable from host files owned by `root:10001` with mode `0640`.
- Preserves strict separation between the runtime and migrator secret files; neither container gains access to the other service's secret.
- Keeps the Backend application port bound to loopback in the staging Compose and retains Nginx as the future public entry point.
- Adds no database migration and no client-visible operation or schema change.
