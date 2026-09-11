import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');
const environmentPath = path.join(repositoryRoot, 'backend', '.env');

const current = await readFile(environmentPath, 'utf8');
const newline = current.includes('\r\n') ? '\r\n' : '\n';

function rotate(source, key) {
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (!pattern.test(source)) throw new Error(`${key} is missing from backend/.env`);
  return source.replace(pattern, `${key}=${randomBytes(36).toString('base64url')}`);
}

const rotatedTeacher = rotate(current, 'LOCAL_SEED_TEACHER_PASSWORD');
const rotatedAll = rotate(rotatedTeacher, 'LOCAL_SEED_ADMIN_PASSWORD');
const normalized = rotatedAll.replace(/\r?\n/g, newline);

await writeFile(environmentPath, normalized, { encoding: 'utf8', mode: 0o600 });
console.log('Local synthetic teacher/admin passwords rotated; values were not printed.');
