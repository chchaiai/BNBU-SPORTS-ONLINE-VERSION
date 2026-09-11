import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const directory = new URL('../../.local/', import.meta.url);
mkdirSync(directory, { recursive: true });
try {
  writeFileSync(new URL('v81-sql.env', directory),
    `V81_SQL_PROBE_PASSWORD=${randomBytes(32).toString('hex')}\n`,
    { flag: 'wx', mode: 0o600 });
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}
console.log(`Local probe environment ready: ${fileURLToPath(directory)}; credentials not printed.`);
