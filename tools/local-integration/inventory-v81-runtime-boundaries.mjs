import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const ts = require('typescript'), { parse } = require('yaml');
const api = parse(fs.readFileSync(path.join(root, 'docs/backend-contracts/openapi.yaml'), 'utf8'));
const operations = new Map();
for (const [route, item] of Object.entries(api.paths)) for (const [method, operation] of Object.entries(item))
  if (operation?.operationId) operations.set(operation.operationId, { method: method.toUpperCase(), route });
const denied = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(filename);
    else if (entry.name.endsWith('.ts')) {
      const text = fs.readFileSync(filename, 'utf8'), source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
      function visit(node) {
        if (ts.isMethodDeclaration(node) && node.body && /\.deny(?:StudentUpdate)?\(/u.test(node.body.getText(source))) {
          const decorator = (ts.getDecorators(node) ?? []).find(d => ts.isCallExpression(d.expression) && d.expression.expression.getText(source) === 'OperationPolicy');
          if (decorator && ts.isStringLiteral(decorator.expression.arguments[0])) {
            const operationId = decorator.expression.arguments[0].text;
            denied.push({ operationId, ...operations.get(operationId), file: path.relative(root, filename).replaceAll('\\', '/'),
              line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, observation: 'HANDLER_DELEGATES_TO_EXPLICIT_DENIAL' });
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
}
walk(path.join(root, 'backend/src/modules'));
const studentSource = fs.readFileSync(path.join(root, 'BNBU-Sports-Web-new/frontend/student/js/api.js'), 'utf8');
const expectedStudentActions = [
  { method: 'POST', route: '/me/account-deletion-challenges', clientFunction: 'requestCurrentUserAccountDeletionChallenge' },
  { method: 'POST', route: '/me/account-deletion-challenges/{challengeId}/confirm', clientFunction: 'confirmCurrentUserAccountDeletion' },
];
const report = { generatedAt: new Date().toISOString(), contractOperationCount: operations.size,
  scope: 'Static explicit denial and named student deletion actions only; not a complete route or UI acceptance test',
  explicitDenials: denied.sort((a, b) => a.operationId.localeCompare(b.operationId)),
  studentDeletion: expectedStudentActions.map(action => ({ ...action, clientPresent: studentSource.includes(`function ${action.clientFunction}(`),
    contractPresent: [...operations.values()].some(op => op.method === action.method && op.route === action.route) })) };
const output = path.join(root, 'docs/implementation/runtime-boundaries-20260908.json');
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ operations: operations.size, explicitDenials: denied.length,
  missingStudentDeletionRoutes: report.studentDeletion.filter(r => r.clientPresent && !r.contractPresent).length,
  output: path.relative(root, output) }));
