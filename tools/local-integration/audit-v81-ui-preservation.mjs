import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const ts = createRequire(new URL('../../backend/package.json', import.meta.url))('typescript');
const git = args => execFileSync('git', ['-c', 'core.quotepath=false', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fragments(filename, text) {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.JS);
  const jsx = [], html = [], literals = [], structure = [];
  function layout(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) structure.push({
      kind: ts.SyntaxKind[node.kind], tag: node.tagName.getText(source), attributes: node.attributes.properties
        .filter(attribute => ts.isJsxAttribute(attribute) && ['className', 'style', 'id', 'role'].includes(attribute.name.getText(source)))
        .map(attribute => attribute.getText(source)) });
    if (ts.isJsxClosingElement(node)) structure.push({ kind: 'Close', tag: node.tagName.getText(source) });
    if (ts.isJsxText(node) && node.text.trim()) structure.push({ kind: 'Text', value: node.text.trim() });
    ts.forEachChild(node, layout);
  }
  layout(source);
  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
      jsx.push(node.getText(source));
      return;
    }
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const value = node.text;
      if (typeof value === 'string') {
        if (/<\/?[a-z][^>]*>/iu.test(value)) html.push(value);
        literals.push(value);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { jsx, html, literals, structure };
}
const changed = git(['diff', '--name-only', 'HEAD', '--', 'BNBU-Sports-Web-new']).trim().split('\n').filter(Boolean);
const sourceFiles = changed.filter(name => /\.(?:tsx?|jsx?|html|css)$/u.test(name) && !name.includes('/tests/'));
const rows = sourceFiles.map(file => {
  const before = git(['show', `HEAD:${file}`]).replaceAll('\r\n', '\n');
  const after = fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
  const old = fragments(file, before), current = fragments(file, after);
  return { file, standaloneLayoutFile: /\.(html|css)$/u.test(file), sourceIdentical: before === after,
    jsxCountBefore: old.jsx.length, jsxCountAfter: current.jsx.length,
    exactJsxUnchanged: hash(old.jsx) === hash(current.jsx), htmlLiteralFragmentsUnchanged: hash(old.html) === hash(current.html),
    jsxElementStyleAndStaticTextUnchanged: hash(old.structure) === hash(current.structure),
    nonJsxLiteralsUnchanged: hash(old.literals) === hash(current.literals),
    jsxDigestBefore: hash(old.jsx), jsxDigestAfter: hash(current.jsx) };
});
const report = { baseCommit: git(['rev-parse', 'HEAD']).trim(), generatedAt: new Date().toISOString(), rows,
  limitations: ['Tracked changed source only. Untracked files need separate scope review.', 'Static JSX/text comparison does not prove CSS runtime, conditional behavior, UX, or browser rendering.',
    'Changed non-JSX literals may be API payloads or user-visible text and require review.'] };
fs.writeFileSync(path.join(root, 'docs/implementation/ui-preservation-20260908.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ trackedSourceFiles: rows.length, changedStandaloneLayoutFiles: rows.filter(r => r.standaloneLayoutFile && !r.sourceIdentical).map(r => r.file),
  changedJsx: rows.filter(r => !r.exactJsxUnchanged).map(r => r.file), changedHtmlFragments: rows.filter(r => !r.htmlLiteralFragmentsUnchanged).map(r => r.file),
  changedElementStyleOrStaticText: rows.filter(r => !r.jsxElementStyleAndStaticTextUnchanged).map(r => r.file),
  changedLiteralFiles: rows.filter(r => !r.nonJsxLiteralsUnchanged).map(r => r.file) }));
