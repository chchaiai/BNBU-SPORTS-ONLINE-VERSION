# Contract 2.0.10 Release Changelog

Baseline: immutable `2.0.9-contract` SHA-256 `2fbad60b72bf4fee6009bb5dad56351b256c2ba80aa7263bec6fe61cfd6298ca`.

- Preserves the published 2.0.9-contract snapshot and advances the API surface under the unique `2.0.10-contract` version.
- Adds a secret-isolated, staging-only Phase 12 business closure operator covering real SES OTP, QR enrollment, session controls, COS media upload and worker processing, record review, score, audit, and idempotency evidence.
- Fails closed unless the public API, TencentDB identity, TLS CA, COS bucket and path, SES template, CORS origins, media scanner mode, confirmation guards, and root-owned business fixture Secret exactly match the frozen staging boundary.
- Adds bounded interruption recovery and rerun verification without deleting synthetic database history or private COS objects.
- Applies explicit CPU, memory, PID, and Docker JSON log rotation limits to every staging Backend Compose service.
- Hardens ephemeral test database reset behind an exact loopback database target and explicit confirmation sentinel.
- Adds no client-visible operation or schema change.
