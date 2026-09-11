import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const split = text => text.split('\0').filter(Boolean);
const tracked = split(git(['diff', '--name-only', '-z', 'HEAD']));
const untracked = split(git(['ls-files', '--others', '--exclude-standard', '-z']));
const paths = [...new Set([...tracked, ...untracked])].sort();
const allowed = file => ['.dockerignore', '.gitignore'].includes(file) ||
  ['backend/', 'contracts/', 'docs/backend-contracts/', 'docs/implementation/', 'tools/', 'BNBU-Sports-Web-new/'].some(prefix => file.startsWith(prefix));
const disallowed = paths.filter(file => !allowed(file));
const deleted = paths.filter(file => !fs.existsSync(path.join(root, file)));
const findings = [], inventory = [];
const patterns = [
  ['PRIVATE_KEY', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gu],
  ['TENCENT_ACCESS_KEY', /\bAKID[A-Za-z0-9]{28,40}\b/gu],
  ['AWS_ACCESS_KEY', /\bAKIA[A-Z0-9]{16}\b/gu],
  ['JWT', /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}/gu],
  ['DATABASE_CREDENTIAL_URL', /postgres(?:ql)?:\/\/[^\s/:]+:[^\s@]{8,}@/gu],
];
for (const file of paths.filter(file => !deleted.includes(file))) {
  const bytes = fs.readFileSync(path.join(root, file));
  inventory.push({ path: file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  if (bytes.includes(0)) continue;
  const text = bytes.toString('utf8');
  for (const [kind, pattern] of patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) findings.push({ path: file, kind, line: text.slice(0, match.index).split('\n').length });
  }
}
fs.mkdirSync(path.join(root, '.local'), { recursive: true });
fs.writeFileSync(path.join(root, '.local/v81-archive-paths.txt'), paths.join('\n') + '\n');
fs.writeFileSync(path.join(root, '.local/v81-archive-paths.z'), paths.join('\0') + '\0');
fs.writeFileSync(path.join(root, '.local/v81-archive-inventory.json'), JSON.stringify({ base: git(['rev-parse', 'HEAD']).trim(), inventory, findings, disallowed, deleted }, null, 2) + '\n');
console.log(JSON.stringify({ paths: paths.length, totalBytes: inventory.reduce((sum, item) => sum + item.bytes, 0), disallowed, deleted,
  credentialCandidateCount: findings.length, candidateFiles: [...new Set(findings.map(f => f.path))] }));
