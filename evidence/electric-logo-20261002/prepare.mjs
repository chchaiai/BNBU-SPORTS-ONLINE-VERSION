import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const evidence = path.join(root, 'evidence/electric-logo-20261002');
const student = path.join(root, 'BNBU-Sports-Web-new/frontend/student');
const relative = ['js/app.js', 'js/app-download-promo.js', 'js/screens/profile.js', 'index.html'];
for (const file of relative) {
  const output = path.join(evidence, 'before/student', file);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  if (!fs.existsSync(output)) fs.copyFileSync(path.join(student, file), output, fs.constants.COPYFILE_EXCL);
}
for (const file of ['index.html', 'scenes.html']) {
  fs.mkdirSync(path.join(evidence, 'before/preview'), { recursive: true });
  if (!fs.existsSync(path.join(evidence, 'before/preview', file))) fs.copyFileSync(path.join(root, 'tools/local-integration/checkin-ui-preview', file), path.join(evidence, 'before/preview', file), fs.constants.COPYFILE_EXCL);
}
fs.copyFileSync('C:/Users/23328/AppData/Local/Temp/codex-clipboard-8ad6ade1-0c82-4c25-a40a-942051177e13.png', path.join(student, 'assets/bnbu-sports-metal.png'));
const text = fs.readFileSync('C:/Users/23328/.codex/attachments/3381402f-2188-43b5-8c78-5dd49a404797/Pasted text.txt', 'utf8').replaceAll('\r\n', '\n');
const source = text.split('### Full Component Source\n```jsx\n')[1].split('\n```')[0];
fs.writeFileSync(path.join(evidence, 'ElectricLogo.supplied.jsx'), source);

const get = async url => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response;
};
const meta = await (await get('https://registry.npmjs.org/ogl/1.0.11')).json();
const archive = Buffer.from(await (await get(meta.dist.tarball)).arrayBuffer());
const integrity = `sha512-${crypto.createHash('sha512').update(archive).digest('base64')}`;
if (integrity !== meta.dist.integrity) throw new Error('OGL registry integrity mismatch');
fs.writeFileSync(path.join(evidence, 'ogl-1.0.11.tgz'), archive);
fs.mkdirSync(path.join(evidence, 'ogl-package'), { recursive: true });
execFileSync('tar', ['-xf', path.join(evidence, 'ogl-1.0.11.tgz'), '-C', path.join(evidence, 'ogl-package')]);
const vendor = path.join(student, 'vendor/electric-logo');
fs.mkdirSync(vendor, { recursive: true });
const ogl = path.join(evidence, 'ogl-package/package');
const oglReadme = fs.readFileSync(path.join(ogl, 'README.md'), 'utf8');
if (!oglReadme.includes('## Unlicense')) throw new Error('OGL license section missing');
fs.writeFileSync(path.join(vendor, 'OGL-LICENSE'), oglReadme.slice(oglReadme.indexOf('## Unlicense')));
const require = createRequire(path.join(root, 'BNBU-Sports-Web-new/package.json'));
await require('esbuild').build({ stdin: { contents: "export { Renderer, Program, Mesh, Triangle, Texture } from './ogl-package/package/src/index.js';", resolveDir: evidence }, outfile: path.join(vendor, 'ogl-1.0.11.js'), bundle: true, format: 'esm', minify: true, legalComments: 'eof' });
const license = await (await get('https://raw.githubusercontent.com/DavidHDev/react-bits/main/LICENSE.md')).text();
fs.writeFileSync(path.join(vendor, 'REACT-BITS-LICENSE'), license);
fs.writeFileSync(path.join(vendor, 'package.json'), '{"type":"module","private":true}\n');

let helpers = source.slice(source.indexOf('const BOLT'), source.indexOf('const ElectricLogo =')).replace('const RASTER = 560;', 'const RASTER = 160;');
let render = source.slice(source.indexOf('    const renderer = new Renderer'), source.indexOf('\n  }, []);'));
render = render.replace('return undefined;', "throw new Error('WebGL2 unavailable');");
render = render.replace('    container.appendChild(canvas);', "    canvas.setAttribute('aria-hidden', 'true');\n    canvas.className = 'electric-logo-canvas';\n    container.appendChild(canvas);");
render = render.replace("    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;", '    const reducedMotion = false;');
render = render.replace('    let progress = 0;', '    let progress = 1;');
render = render.replace('    let visible = true;', '    let visible = false;\n    let intersecting = false;\n    let disposed = false;');
render = render.replace('      raf = 0;\n      const s', "      raf = 0;\n      if (!visible || disposed || !container.isConnected) return;\n      if (now - last < 1000 / 30) { raf = requestAnimationFrame(frame); return; }\n      const s");
render = render.replace('      if (raf || !visible) return;', '      if (raf || !visible || disposed) return;');
render = render.replace("    const intersectionObserver = new IntersectionObserver(([entry]) => {\n      visible = entry.isIntersecting;\n      start();\n    });", "    const updateVisibility = () => {\n      visible = intersecting && !document.hidden && !disposed;\n      if (visible) start();\n      else { cancelAnimationFrame(raf); raf = 0; pointer.over = false; sparks.length = 0; pulses.length = 0; }\n    };\n    const intersectionObserver = new IntersectionObserver(([entry]) => {\n      intersecting = entry.isIntersecting;\n      updateVisibility();\n    });\n    document.addEventListener('visibilitychange', updateVisibility);");
render = render.replace("    return () => {\n      visible = false;", "    const onContextLost = () => { container.dataset.electricState = 'fallback'; options.onFailure?.(); };\n    canvas.addEventListener('webglcontextlost', onContextLost);\n    return () => {\n      disposed = true;\n      alive = false;\n      visible = false;\n      document.removeEventListener('visibilitychange', updateVisibility);\n      canvas.removeEventListener('webglcontextlost', onContextLost);");
const wrapper = `// Adapted from the user-supplied React Bits ElectricLogo. See vendor/electric-logo licenses.\nimport { Renderer, Program, Mesh, Triangle, Texture } from './ogl-1.0.11.js';\n\n${helpers}\nconst shapes = new Map();\nconst loadShape = src => {\n  if (!shapes.has(src)) shapes.set(src, new Promise((resolve, reject) => {\n    const image = new Image();\n    image.decoding = 'async';\n    image.onload = () => { try { const shape = traceShape(image); if (!shape) throw new Error('Empty logo'); resolve(shape); } catch (error) { reject(error); } };\n    image.onerror = () => reject(new Error('Logo unavailable'));\n    image.src = src;\n  }));\n  return shapes.get(src);\n};\n\nexport function createElectricLogo(container, options = {}) {\n  const settingsRef = { current: { src: BOLT, color: '#eff8ff', glowColor: '#8dcaff', scale: .74, intensity: .82, glow: .55, thickness: .38, strands: 2, bend: .13, crackle: .12, arcs: .22, flicker: .12, fill: 0, speed: 1.25, interactive: true, cursorIntensity: .35, cursorRadius: 30, theme: 'dark', ...options } };\n  const shapeRef = { current: null };\n  let alive = true;\n  loadShape(settingsRef.current.src).then(shape => { if (alive) shapeRef.current = shape; }).catch(() => { if (alive) options.onFailure?.(); });\n${render}\n}\n`;
fs.writeFileSync(path.join(vendor, 'electric-logo.js'), wrapper);
fs.writeFileSync(path.join(vendor, 'README.md'), '# ElectricLogo\n\nAdapted from the React Bits ElectricLogo source supplied by the user on 2026-10-02. Original project: https://github.com/DavidHDev/react-bits . License: REACT-BITS-LICENSE (MIT + Commons Clause). OGL 1.0.11: https://github.com/oframe/ogl . License: OGL-LICENSE (Unlicense).\n\nLocal ESM bundle: Renderer, Program, Mesh, Triangle, Texture. Registry SHA-512: ' + integrity + '\n\nAdaptation: plain JavaScript lifecycle, shared 160px shape cache for small icons, 30fps cap, visibility pause, context-loss fallback. The React shader and outline-tracing algorithm are retained. Reduced-motion users keep the static uploaded PNG without loading WebGL.\n');
console.log('Saved pre-change snapshots, copied uploaded PNG, vendored verified OGL 1.0.11, adapted supplied ElectricLogo.');
