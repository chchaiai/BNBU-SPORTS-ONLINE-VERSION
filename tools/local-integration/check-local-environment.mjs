import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseEnvironment,
  validateLocalEnvironment,
} from "./environment-config.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..", "..");
const envPath = resolve(repositoryRoot, "backend", ".env");

if (!existsSync(envPath)) {
  console.error("LOCAL_ENV_CHECK=MISSING backend/.env");
  process.exit(2);
}

const failures = validateLocalEnvironment(
  parseEnvironment(readFileSync(envPath, "utf8")),
);

if (failures.length > 0) {
  console.error(`LOCAL_ENV_CHECK=FAIL count=${failures.length}`);
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log("LOCAL_ENV_CHECK=PASS");
console.log(
  "scope=local-only postgres=5433 minio=9000 mailpit=1025 web-origins=127.0.0.1,localhost secrets=redacted",
);
