// Build immutable student assets from an explicit, captured production tree.
// Preserve module/worker paths: no bundling or business-code transformations.
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'BNBU-Sports-Web-new/portal-teacher-admin/package.json'));
const { transform } = require('esbuild');
const { init, parse } = require('es-module-lexer');
await init;
const [sourceArg, outputArg] = process.argv.slice(2);
if (!sourceArg || !outputArg) throw new Error('Usage: node build-student-assets.mjs SOURCE OUTPUT');
const source = path.resolve(sourceArg), output = path.resolve(outputArg);
if (output === source || output.startsWith(source + path.sep)) throw new Error('Output must be outside source');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function walk(dir, prefix = '') {
  const files = [];
  for (const item of (await readdir(dir, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
    const name = prefix + item.name;
    if (item.isSymbolicLink()) throw new Error('Unexpected symlink: ' + name);
    if (item.isDirectory()) files.push(...await walk(path.join(dir, item.name), name + '/'));
    else files.push(name);
  }
  return files;
}
const files = new Map();
for (const folder of ['js', 'css', 'assets', 'vendor']) {
  for (const name of await walk(path.join(source, folder), folder + '/')) {
    let bytes = await readFile(path.join(source, name));
    if ((name.startsWith('js/') && !name.startsWith('js/vendor/') && name.endsWith('.js')) || (name.startsWith('css/') && name.endsWith('.css'))) {
      const result = await transform(bytes.toString('utf8'), {
        loader: name.endsWith('.css') ? 'css' : 'js',
        minifyWhitespace: true, minifySyntax: false, minifyIdentifiers: false,
        legalComments: 'inline', charset: 'utf8', sourcefile: name,
      });
      bytes = Buffer.from(result.code);
    }
    files.set(name, bytes);
  }
}
const entries = Object.fromEntries([...files].map(([name, bytes]) => [name, hash(bytes)]));
const version = hash(JSON.stringify(entries)).slice(0, 24);
const base = `/student/_assets/${version}/`;
for (const [name, bytes] of files) {
  const target = path.join(output, '_assets', version, name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
}
const visited = new Set();
function visit(name) {
  if (visited.has(name)) return;
  const bytes = files.get(name);
  if (!bytes) throw new Error('Missing static module: ' + name);
  visited.add(name);
  for (const item of parse(bytes.toString('utf8'))[0]) {
    if (item.d !== -1 || !item.n) continue;
    if (!item.n.startsWith('.')) throw new Error('Unexpected module URL: ' + item.n);
    visit(path.posix.normalize(path.posix.join(path.posix.dirname(name), item.n.split('?')[0])));
  }
}
visit('js/app.js'); visit('js/emblem.js');
let html = await readFile(path.join(source, 'index.html'), 'utf8');
html = html.replace(/(href|src)="\.\/(css\/[^"<>]+|js\/[^"<>]+)"/g, (_, attr, name) => `${attr}="${base}${name}"`);
// Discover critical dependencies with HTML rather than after each JS round trip.
const preload = [...visited].filter(name => !['js/app.js','js/emblem.js'].includes(name))
  .map(name => `  <link rel="modulepreload" href="${base}${name}" />`).join('\n');
html = html.replace('</head>', preload + '\n</head>');
await writeFile(path.join(output, 'index.html'), html);
const report = { version, base, files: entries, initialModules: [...visited],
  initialJavaScriptBytes: [...visited].reduce((sum, name) => sum + files.get(name).length, 0),
  originalInitialJavaScriptBytes: (await Promise.all([...visited].map(name => readFile(path.join(source, name))))).reduce((sum,b) => sum + b.length, 0),
  htmlSha256: hash(html) };
await writeFile(path.join(output, 'asset-manifest.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ version, files: files.size, initialModules: visited.size, initialJavaScriptBytes: report.initialJavaScriptBytes }));
