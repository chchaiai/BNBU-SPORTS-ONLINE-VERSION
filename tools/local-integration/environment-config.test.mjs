import assert from "node:assert/strict";
import test from "node:test";

import {
  parseEnvironment,
  validateLocalEnvironment,
} from "./environment-config.mjs";

const validEnvironment = () =>
  parseEnvironment(`
APP_ENV=local
PORT=3000
DATABASE_URL=postgresql://bnbu_app:synthetic@127.0.0.1:5433/bnbu_sports?schema=public
MIGRATION_DATABASE_URL=postgresql://bnbu_migrator:synthetic@127.0.0.1:5433/bnbu_sports?schema=public
TOKEN_SIGNING_KEY=synthetic-private
TOKEN_VERIFYING_KEY=synthetic-public
ACCESS_TOKEN_TTL=900
REFRESH_TOKEN_IDLE_TTL=604800
REFRESH_TOKEN_ABSOLUTE_TTL=2592000
IDEMPOTENCY_RETENTION=86400
IDEMPOTENCY_LEASE=30
IDEMPOTENCY_ENCRYPTION_KEY=synthetic-idempotency
COURSE_INVITE_TTL_SECONDS=604800
JOIN_CAPABILITY_TTL_SECONDS=300
QR_JOIN_TOKEN_HASH_KEY=synthetic-qr-hash
QR_JOIN_SECRET_ENCRYPTION_KEY=synthetic-qr-encryption
QR_JOIN_SECRET_REPLAY_SECONDS=86400
PUSH_TOKEN_ENCRYPTION_KEY=synthetic-push
OBJECT_STORAGE_ENDPOINT=http://127.0.0.1:9000
MEDIA_STORAGE_ENDPOINT=http://127.0.0.1:9000
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
CORS_ALLOWLIST=http://127.0.0.1:3001,http://localhost:3001
LOCAL_SEED_TEACHER_PASSWORD=synthetic-teacher
LOCAL_SEED_ADMIN_PASSWORD=synthetic-admin
`);

test("accepts the generated local TTL relationships", () => {
  assert.deepEqual(validateLocalEnvironment(validEnvironment()), []);
});

for (const fixture of [
  {
    name: "idempotency lease must be shorter than retention",
    key: "IDEMPOTENCY_LEASE",
    value: "86400",
    failure: "IDEMPOTENCY_TTL:invalid-order",
  },
  {
    name: "QR replay window must cover idempotency retention",
    key: "QR_JOIN_SECRET_REPLAY_SECONDS",
    value: "86399",
    failure: "QR_REPLAY:shorter-than-idempotency",
  },
  {
    name: "join capability TTL must be shorter than course invite TTL",
    key: "JOIN_CAPABILITY_TTL_SECONDS",
    value: "604800",
    failure: "JOIN_CAPABILITY_TTL:not-shorter-than-course-invite",
  },
]) {
  test(fixture.name, () => {
    const values = validEnvironment();
    values.set(fixture.key, fixture.value);
    assert.ok(validateLocalEnvironment(values).includes(fixture.failure));
  });
}
