// Generate only INSERT fixtures from the existing test helpers. Never include reset utilities.
// Run from repository root: node tools/production/prepare-smoke-helpers.cjs
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../../backend/node_modules/typescript');
let foundation = fs.readFileSync('backend/test/helpers/database.ts', 'utf8');
foundation = foundation.slice(foundation.indexOf('export async function seedFoundationFixture'));
let student = fs.readFileSync('backend/test/helpers/exercise-session.ts', 'utf8');
student = student.slice(student.indexOf('export async function seedExerciseSessionStudent'));
const source = "import { hash, argon2id } from 'argon2';\nimport { v7 as uuidv7 } from 'uuid';\nimport { randomBytes } from 'node:crypto';\nconst TEST_PASSWORD=randomBytes(32).toString('base64url');\n" + foundation + '\n' + student;
if (/TRUNCATE|DROP TABLE|resetFoundationDatabase/.test(source)) throw new Error('Unexpected destructive fixture operation');
fs.mkdirSync('.local', { recursive: true });
fs.writeFileSync(path.resolve('.local/production-smoke-helpers.mjs'), ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
