# Contract 2.0.11 Release Changelog

Baseline: immutable `2.0.10-contract` SHA-256 `56f7f13cdd8122dae630fec93bf198f7ed6d92a5fc4f67ae4f866a3b41c38ad7`.

- Preserves the published 2.0.10-contract snapshot and advances the immutable contract release under the unique `2.0.11-contract` version without changing the API surface.
- Corrects the staging-only business closure operator to require the persisted QR join capability state `ACTIVE`, matching the accepted domain rule, Migration, and E2E evidence.
- Rejects the stale, non-domain `ISSUED` expectation through focused fail-closed unit coverage.
- Preserves only Backend-valid inbound request IDs through Nginx and uses the same canonical ID for the API proxy, same-origin Web proxy, response, and access log.
- Replaces malformed or overlong inbound request IDs with an Nginx-generated fallback while retaining invite-token URI redaction.
- Adds no client-visible operation or schema change.
