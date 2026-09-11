import { generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseEnvironment,
  validateLocalEnvironment,
} from "./environment-config.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..", "..");
const examplePath = resolve(repositoryRoot, "backend", ".env.example");
const outputPath = resolve(repositoryRoot, "backend", ".env");

if (existsSync(outputPath)) {
  console.error("LOCAL_ENV_INIT=REFUSED_EXISTING_ENV");
  console.error(
    "backend/.env already exists; it was not read, printed, or overwritten.",
  );
  process.exit(2);
}

const randomSecret = (bytes = 32) => randomBytes(bytes).toString("base64url");
const randomKey = () => randomBytes(32).toString("base64");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privatePem = privateKey
  .export({ format: "pem", type: "pkcs8" })
  .trim()
  .replace(/\r?\n/g, "\\n");
const publicPem = publicKey
  .export({ format: "pem", type: "spki" })
  .trim()
  .replace(/\r?\n/g, "\\n");

const databasePassword = randomSecret();
const migratorPassword = randomSecret();
const bootstrapPassword = randomSecret();
const rosterAccessKey = `roster-${randomSecret(12)}`;
const rosterSecretKey = randomSecret();
const mediaAccessKey = `media-${randomSecret(12)}`;
const mediaSecretKey = randomSecret();

const replacements = new Map(
  Object.entries({
    APP_ENV: "local",
    APP_VERSION: "local-integration",
    PORT: "3000",
    LOG_LEVEL: "debug",
    DATABASE_URL: `postgresql://bnbu_app:${databasePassword}@127.0.0.1:5433/bnbu_sports?schema=public`,
    MIGRATION_DATABASE_URL: `postgresql://bnbu_migrator:${migratorPassword}@127.0.0.1:5433/bnbu_sports?schema=public`,
    POSTGRES_DB: "bnbu_sports",
    POSTGRES_BOOTSTRAP_USER: "bnbu_bootstrap",
    POSTGRES_BOOTSTRAP_PASSWORD: bootstrapPassword,
    POSTGRES_APP_USER: "bnbu_app",
    POSTGRES_APP_PASSWORD: databasePassword,
    POSTGRES_MIGRATOR_USER: "bnbu_migrator",
    POSTGRES_MIGRATOR_PASSWORD: migratorPassword,
    TOKEN_ISSUER: "bnbu-sports-local",
    TOKEN_AUDIENCE: "bnbu-sports-local-clients",
    TOKEN_SIGNING_KEY: privatePem,
    TOKEN_VERIFYING_KEY: publicPem,
    ACCESS_TOKEN_TTL: "900",
    REFRESH_TOKEN_ABSOLUTE_TTL: "2592000",
    REFRESH_TOKEN_IDLE_TTL: "604800",
    IDEMPOTENCY_RETENTION: "86400",
    IDEMPOTENCY_LEASE: "30",
    IDEMPOTENCY_ENCRYPTION_KEY: randomKey(),
    SECURITY_HASH_KEY: randomSecret(),
    AUTH_RATE_LIMIT_WINDOW_SECONDS: "60",
    AUTH_RATE_LIMIT_MAX_ATTEMPTS: "20",
    CORS_ALLOWLIST: "http://127.0.0.1:3001,http://localhost:3001",
    TRUST_PROXY: "false",
    SYSTEM_MODE_SOURCE: "database",
    REQUEST_BODY_LIMIT_BYTES: "2097152",
    REQUEST_TIMEOUT_MS: "10000",
    COURSE_INVITE_TTL_SECONDS: "604800",
    JOIN_CAPABILITY_TTL_SECONDS: "300",
    QR_JOIN_TOKEN_HASH_KEY: randomKey(),
    QR_JOIN_SECRET_ENCRYPTION_KEY: randomKey(),
    QR_JOIN_SECRET_REPLAY_SECONDS: "86400",
    QR_JOIN_PUBLIC_RATE_LIMIT_WINDOW_SECONDS: "60",
    QR_JOIN_PUBLIC_RATE_LIMIT_MAX_REQUESTS: "60",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: "1025",
    SMTP_SECURE: "false",
    SMTP_FROM_ADDRESS: "no-reply@local.bnbu.invalid",
    MAILPIT_SMTP_PORT: "1025",
    MAILPIT_UI_PORT: "8025",
    PUSH_TOKEN_ENCRYPTION_KEY: randomKey(),
    PUSH_TOKEN_ENCRYPTION_KEY_VERSION: "1",
    OBJECT_STORAGE_ENDPOINT: "http://127.0.0.1:9000",
    OBJECT_STORAGE_REGION: "local",
    OBJECT_STORAGE_BUCKET: "bnbu-sports-local-private",
    OBJECT_STORAGE_ACCESS_KEY: rosterAccessKey,
    OBJECT_STORAGE_SECRET_KEY: rosterSecretKey,
    OBJECT_STORAGE_FORCE_PATH_STYLE: "true",
    OBJECT_STORAGE_REQUIRED: "false",
    MEDIA_STORAGE_REQUIRED: "true",
    MEDIA_STORAGE_ENDPOINT: "http://127.0.0.1:9000",
    MEDIA_STORAGE_REGION: "local",
    MEDIA_STORAGE_BUCKET: "bnbu-sports-local-media-private",
    MEDIA_STORAGE_ACCESS_KEY: mediaAccessKey,
    MEDIA_STORAGE_SECRET_KEY: mediaSecretKey,
    MEDIA_STORAGE_FORCE_PATH_STYLE: "true",
    MEDIA_UPLOAD_URL_TTL_SECONDS: "300",
    MEDIA_ACCESS_URL_TTL_SECONDS: "300",
    MEDIA_MAX_IMAGE_BYTES: "10485760",
    MEDIA_MAX_IMAGE_PIXELS: "40000000",
    MEDIA_MAX_VIDEO_TRANSPORT_BYTES: "536870912",
    MEDIA_SCANNER_MODE: "TEST_SIGNATURE",
    MEDIA_WORKER_ENABLED: "true",
    MEDIA_WORKER_POLL_MS: "500",
    MINIO_ROOT_USER: `minio-${randomSecret(12)}`,
    MINIO_ROOT_PASSWORD: randomSecret(),
    MINIO_BUCKET: "bnbu-sports-local-private",
    LOCAL_SEED_TEACHER_PASSWORD: randomSecret(),
    LOCAL_SEED_ADMIN_PASSWORD: randomSecret(),
  }),
);

const seen = new Set();
const output = readFileSync(examplePath, "utf8")
  .split(/\r?\n/)
  .map((line) => {
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line);
    if (!match) return line;
    const key = match[1];
    const value = replacements.get(key);
    if (value === undefined) return line;
    seen.add(key);
    return `${key}=${value}`;
  })
  .join("\n");

const missingKeys = [...replacements.keys()].filter((key) => !seen.has(key));
if (missingKeys.length > 0) {
  console.error(
    `LOCAL_ENV_INIT=TEMPLATE_MISMATCH missing=${missingKeys.join(",")}`,
  );
  process.exit(3);
}
if (/^[A-Z][A-Z0-9_]*=.*CHANGE_ME/m.test(output)) {
  console.error("LOCAL_ENV_INIT=PLACEHOLDER_REMAINS");
  process.exit(4);
}

const validationFailures = validateLocalEnvironment(parseEnvironment(output));
if (validationFailures.length > 0) {
  console.error(
    `LOCAL_ENV_INIT=INVALID_GENERATED_ENV count=${validationFailures.length}`,
  );
  for (const failure of validationFailures) console.error(failure);
  process.exit(5);
}

writeFileSync(outputPath, `${output.trimEnd()}\n`, {
  encoding: "utf8",
  flag: "wx",
  mode: 0o600,
});
console.log("LOCAL_ENV_INIT=PASS");
console.log(
  "output=backend/.env secrets=generated values=redacted overwrite=false",
);
