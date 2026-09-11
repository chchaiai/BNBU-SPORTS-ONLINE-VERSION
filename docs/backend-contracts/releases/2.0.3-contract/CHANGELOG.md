# Contract 2.0.3 Release Changelog

Baseline: immutable `2.0.2-contract` SHA-256 `853e7f5efadb10dcbbe0f446c4c60962ce2fd864360a156343b5740d0c1761a4`.

- Preserves the published 2.0.2-contract snapshot and advances the API surface under the unique `2.0.3-contract` version.
- Adds fail-fast `FILE_JSON` runtime and migrator secret loading for Docker Compose secrets, including duplicate environment-variable rejection and strict key allowlists.
- Adds a secret-safe staging preflight that reports only configured, missing, or unknown status and never prints managed values.
- Adds Tencent CVM instance-role credential discovery for COS so staging does not store long-lived COS keys.
- Adds the Tencent Cloud SES `SendEmail` adapter for the approved email template and verification-code variable.
- Publishes the staging Compose, credential-free environment template, least-privilege COS and SES CAM policy baselines, and Docker runtime smoke test.
- Keeps the Backend application port bound to loopback in the staging Compose and retains Nginx as the future public entry point.
- Pins the Tencent SDK dependency path to a zero-vulnerability audited set without changing the public API contract.
- Adds no database migration and no client-visible operation or schema change.
