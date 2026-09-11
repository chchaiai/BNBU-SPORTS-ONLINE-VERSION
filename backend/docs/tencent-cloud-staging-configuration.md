# Tencent Cloud staging configuration

This document defines the staging configuration boundary for BNBU Sports. It does not authorize deployment, cloud-resource changes, or TencentDB migration.

## Frozen values

| Setting                 | Frozen staging value                  |
| ----------------------- | ------------------------------------- |
| Tencent Cloud region    | `ap-guangzhou`                        |
| API origin              | `https://api.verityai.cn`             |
| Backend CORS origins    | exact `admin` and `www` HTTPS origins |
| COS CORS origin         | exact `https://www.verityai.cn`       |
| Email provider          | `TENCENT_SES`                         |
| SES sender              | `no-reply@verityai.cn`                |
| SES template ID         | `56852`                               |
| COS bucket              | `sports-staging-media-1443273655`     |
| Media scanner           | `TEST_SIGNATURE`                      |
| Runtime secret provider | `FILE_JSON`                           |
| COS credential provider | `TENCENT_CVM_ROLE`                    |

`TEST_SIGNATURE` is staging-only and is not an external malware-scanning control.

## Secret and trust boundaries

Provision five UTF-8 JSON files and one complete TencentDB CA chain outside Git, then mount only the files needed by each Docker Compose service. Never put JSON values in this repository, Docker image, deployment report, or command-line arguments.

- Runtime file target: `/run/secrets/bnbu_runtime.json`; it may contain only the names listed in `runtimeSecret` in `config/staging-configuration-requirements.json`.
- Migrator file target: `/run/secrets/bnbu_migrator.json`; it may contain only `MIGRATION_DATABASE_URL`.
- Synthetic health fixture target: `/run/secrets/bnbu_staging_fixture.json`; it may contain only `STAGING_ADMIN_PASSWORD`, is mounted only by the `operations` profile, and is never mounted by the long-running Backend or migrator.
- Synthetic business fixture target: `/run/secrets/bnbu_staging_business_fixture.json`; it may contain only the three names listed in `businessFixtureSecret`, is mounted only by the one-shot business operator, and is never mounted by the long-running Backend, migrator, or health operator.
- R01 manual-testing fixture target: `/run/secrets/bnbu_staging_r01_fixture.json`; it may contain only the four Admin account/password and Teacher account/password fields listed in `r01FixtureSecret`. Student mailbox, OTP, token, and credential fields are forbidden. It is mounted only by the one-shot R01 provisioner and is never mounted by the long-running Backend, migrator, health operator, or business operator.
- TencentDB CA target: `/run/secrets/tencentdb-ca-chain.pem`; it must contain the TencentDB intermediate and root CA certificates in PEM form.

On the Compose host, all six source files must be owned by `root:10001` with mode `0640`. GID `10001` is the dedicated secret-reader group: the Backend image already uses it as the `bnbu` runtime group, and Compose adds it as a supplemental group to Backend, migrator, health-operator, business-operator, and r01-provisioner containers. Local Docker Compose mounts file-backed secrets without remapping host ownership, so `root:root 0600` is intentionally rejected as unreadable by the non-root services. Do not add interactive host users to GID `10001`.

The Backend service mounts the runtime JSON plus the shared CA chain. The migration profile mounts the migrator JSON plus the same CA chain. The operations profile uses three separate one-shot services: the health operator receives runtime, health-fixture, and CA files; the business operator receives runtime, business-fixture, and CA files; the R01 provisioner receives runtime, R01-fixture, and CA files. No long-running service can read a fixture, each operator can read only its own fixture, and no operator can read the migrator credential. The JSON loaders reject unknown keys, missing keys, duplicate environment values, invalid UTF-8, relative paths, and oversized files. The CA loader rejects relative paths, invalid PEM, leaf certificates, incomplete chains, and files larger than 128 KiB. Staging and production fail closed when `RUNTIME_SECRET_PROVIDER` is not `FILE_JSON` or the CA chain is unavailable.

Runtime `PrismaPg` receives explicit host, port, user, password, database, and strict TLS options so a connection-string parser cannot overwrite the CA configuration. The migration launcher injects the persisted chain through `SSL_CERT_FILE` and upgrades the child-only URL to `sslmode=verify-full` plus `sslaccept=strict`. No URL or certificate body is printed.

COS and SES use the CVM instance role. COS credentials are obtained from instance metadata as automatically refreshed STS credentials including the security token. Static COS SecretId and SecretKey values are rejected in staging and production. Apply `config/tencent-cloud-staging-cam-policy.json` and `config/tencent-cloud-staging-ses-cam-policy.json` to the role, verify both capabilities, and then remove `QcloudCOSDataFullControl` and `QcloudSESFullAccess`. The custom COS policy is limited to the staging bucket's `roster-sources/*` and `media/*` prefixes and contains no bucket-delete or wildcard actions. The custom SES policy allows only the operation-level `SendEmail` API; Tencent Cloud requires `resource: "*"` for that operation-level action.

## Missing-configuration mechanism

The manifest at `config/staging-configuration-requirements.json` is the authoritative inventory. Every item records its owner and source.

Run a local name-only check:

```bash
node --env-file=config/staging.env.example scripts/check-staging-configuration.mjs
```

Read and validate all five JSON files plus the CA chain by status only in an authorized preflight context:

```bash
npm run staging:config:check:files
```

Both commands print statuses and configuration names only. They never print secret values or certificate bodies. `--files` validates that all five JSON files contain exactly the allowed key names, rejects any allowlisted secret name that is also present in the process environment, and verifies that the CA chain is complete. For R01 it also rejects the three retired `STAGING_R01_STUDENT_*_EMAIL` environment names, so an old `staging.env` cannot silently restore the removed Student credential path. Each operator applies its stricter password and account checks at execution time; the R01 operator does not accept Student credentials. Normal runtime and migration containers remain isolated and never mount fixture JSON.

The staging Compose definition is `docker-compose.staging.yml`. It binds the Backend only to `127.0.0.1:3000`, requires immutable runtime and migrator image references, mounts each service's secrets separately, grants only supplemental GID `10001` for file reads, drops Linux capabilities, enables a read-only root filesystem, and keeps migration and all three operators behind explicit profiles. The R01 service additionally sets `pull_policy: never`, and its Runbook requires `run --pull never`, so an absent frozen local image stops execution instead of pulling a mutable registry name. Every service explicitly uses Docker's `json-file` logging driver with `max-size=10m` and `max-file=5`; the limit also applies to one-shot migration and operation containers so repeated runs cannot accumulate unbounded Docker logs.

Docker applies logging options when a container is created. A deployment that changes these options must recreate the affected containers; restarting an existing container is insufficient. Before recreation, retain the prior release's Compose file as the rollback input. After recreation, verify the effective settings without reading environment variables or log contents:

```bash
docker inspect --format '{{.Name}} driver={{.HostConfig.LogConfig.Type}} options={{json .HostConfig.LogConfig.Config}}' bnbu-sports-staging-backend-1
```

The expected Backend result is `driver=json-file` with only `max-size=10m` and `max-file=5`. This local retention boundary does not replace off-host log monitoring, alerting, or an approved retention policy.

The 4 GiB staging host also has explicit Compose resource boundaries: Backend is limited to `1.50` CPU, `1536m`, and 256 PIDs; migrator, health operator, business operator, and R01 provisioner are each limited to `1.00` CPU, `768m`, and 256 PIDs. These four one-shot services are operationally serialized and must not be run concurrently. These are containment limits, not evidence of capacity testing or production sizing.

The repository example keeps `CORS_ALLOWLIST=https://web-origin-not-configured.invalid` as a fail-closed bootstrap sentinel, but the deployed staging Backend now uses only `https://admin.verityai.cn,https://www.verityai.cn`. Both Web applications normally use same-origin `/api/v1`, so that allowlist is defense in depth rather than a reason to call the API origin directly. Staging and production reject HTTP origins and wildcard entries.

The staging COS bucket separately allows only `https://www.verityai.cn`, with methods `PUT`, `GET`, and `HEAD`; request headers `Content-Type` and `Content-Length`; exposed headers `ETag` and `Content-Length`; max age `600`; and `Vary` enabled. Positive `www` preflight and negative `admin`, retired HTTP IP, and unknown-origin preflights have been verified. Do not add another origin unless a real browser capability requires it and both positive and negative tests pass.

The health operator has two commands. `bootstrap` creates or verifies one isolated synthetic organization and ADMIN in a single serializable transaction; it never updates, resets, or deletes conflicting data. `verify` logs in over the private Compose network, calls authenticated admin health, verifies the request ID and all dependency states, and logs out. Both commands require the exact `STAGING_BOOTSTRAP_CONFIRMATION` sentinel and an isolated fixture secret. Output is status-only and never includes the password, token, hash, internal IDs, or provider response bodies.

The Phase 12 business operator is documented in `docs/staging-business-closure-operator.md`. It uses a separate fixture, an interactive hidden SES code, the exact public HTTPS API, and a real private COS object. It never receives secrets through arguments or output and does not turn device, real-video, or production-scanner evidence into an automated pass.

The R01 provisioner is documented in `../../docs/deployment/STAGING-R01-PROVISIONING-RUNBOOK.md`. It creates or verifies the fixed `BNBU` Organization, Course, Section, two interactive staff identities, and one non-login approval-support identity in one serializable transaction. It never creates Student User, StudentProfile, AuthSession, or Enrollment rows. Before staff or topology writes, it requires all three reserved R01 student numbers to be absent, including soft-deleted profiles. Before commit, it queries and requires exactly three Users (two Admin and one Teacher), two AdminProfiles, one TeacherProfile, zero Student identities, zero AuthSessions, and zero Enrollments; the safe result is built from those query results. Any extra identity, session, Enrollment, cross-role Profile, or mismatched topology metadata fails closed. The immediate idempotency replay must occur before any Student tester starts the real OTP and join flow; later reruns intentionally fail once a reserved Student profile exists.

## Console inputs still required

Before Phase 2 can pass, a human must confirm or create the following in Tencent Cloud Console:

1. The runtime JSON file with the exact allowlist, the migrator JSON file containing only `MIGRATION_DATABASE_URL`, the isolated health fixture JSON containing only `STAGING_ADMIN_PASSWORD`, the separate business fixture JSON containing only `businessFixtureSecret`, the separate R01 fixture JSON containing only `r01FixtureSecret`, and the complete TencentDB CA chain.
2. The `sports_staging_app` TencentDB runtime account and its least-privilege grants; `sports_staging_admin` remains the separate migration/schema account.
3. TencentDB SSL must reach the enabled state, and `sports-staging-pg-sg` must restrict `5432/tcp` to the CVM private identity. A similarly shaped rule on another security group does not satisfy this gate.
4. Replace the role's current `QcloudCOSDataFullControl` and `QcloudSESFullAccess` policies with the repository's exact COS and SES custom policies.
5. Verify from inside the Backend container that CVM metadata credentials can be obtained without exposing their values.
6. Preserve and revalidate the exact COS CORS baseline above. Do not add `admin`, apex, API, wildcard, the retired HTTP IP, or the reserved `.invalid` sentinel without a separately accepted browser capability.

`APP_VERSION` remains release-owned and must be replaced with the published Backend release version. Placeholder values beginning with `CHANGE_ME` intentionally fail the preflight.

## Operational gates

- A configuration check failure stops deployment before a container is started.
- A missing or invalid runtime JSON file stops Backend startup.
- A missing or invalid migrator JSON file stops migration before Prisma is launched.
- A missing, invalid, or incomplete TencentDB CA chain stops Backend construction or migration before database authentication.
- A CVM role credential or COS authorization failure maps to the stable storage-unavailable error without logging provider details.
- An SES API failure is retried at most three times and then returns the stable unavailable error; credentials and provider error bodies are not logged.
- Database migration remains a separately authorized operation and uses the migrator secret only.
- A fixture conflict, password mismatch, target Enrollment, or cross-role Profile stops the applicable one-shot operator without modifying existing data.
- The health verifier always attempts logout after a successful login and fails if authenticated admin health or logout is not HTTP 200.
