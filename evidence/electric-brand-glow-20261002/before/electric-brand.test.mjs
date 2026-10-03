import test from 'node:test';
import assert from 'node:assert/strict';
import { createElectricBrandManager, captureElectricBrands, restoreElectricBrands } from './js/electric-brand.js';
import { containLogoPlacement } from './vendor/electric-logo/placement.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture({ reduced = false, deferred = false, failure = false } = {}) {
  const node = { dataset: {}, isConnected: true, querySelectorAll: () => [] };
  let current = [node], mounts = 0, cleanups = 0, loads = 0, resolve;
  const listeners = new Set();
  const motion = { matches: reduced, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
  const module = { createElectricLogo: () => { mounts++; return () => cleanups++; } };
  const waiting = new Promise(done => { resolve = done; });
  const manager = createElectricBrandManager({
    reducedMotion: motion,
    document: { querySelectorAll: () => current },
    loadRenderer: () => { loads++; return failure ? Promise.reject(new Error('offline')) : deferred ? waiting : module; },
  });
  return { node, manager, motion, listeners, resolve: () => resolve(module), setNodes: value => { current = value; }, stats: () => ({ mounts, cleanups, loads }) };
}

test('reduced motion does not request or initialize the WebGL dependency', async () => {
  const f = fixture({ reduced: true }); f.manager.sync(); await flush();
  assert.deepEqual(f.stats(), { mounts: 0, cleanups: 0, loads: 0 });
  assert.equal(f.node.dataset.electricState, 'static'); f.manager.dispose();
});
test('repeated renders reuse one logo instance; removing its screen releases it', async () => {
  const f = fixture(); f.manager.sync(); f.manager.sync(); await flush();
  f.manager.sync(); assert.equal(f.stats().mounts, 1);
  f.setNodes([]); f.manager.sync(); assert.equal(f.stats().cleanups, 1); f.manager.dispose();
});
test('a late dependency cannot mount after the logo is removed', async () => {
  const f = fixture({ deferred: true }); f.manager.sync(); await flush();
  f.setNodes([]); f.node.isConnected = false; f.manager.sync(); f.resolve(); await flush();
  assert.equal(f.stats().mounts, 0); f.manager.dispose();
});
test('dependency failure keeps the static logo and never enters a render retry loop', async () => {
  const f = fixture({ failure: true }); f.manager.sync(); await flush();
  f.manager.sync(); await flush(); assert.equal(f.node.dataset.electricState, 'fallback');
  assert.equal(f.stats().loads, 1); assert.equal(f.stats().mounts, 0); f.manager.dispose();
});
test('changing reduced-motion preference immediately disposes animation and can restore it', async () => {
  const f = fixture(); f.manager.sync(); await flush();
  f.motion.matches = true; f.listeners.forEach(fn => fn());
  assert.equal(f.stats().cleanups, 1); assert.equal(f.node.dataset.electricState, 'static');
  f.motion.matches = false; f.listeners.forEach(fn => fn()); await flush();
  assert.equal(f.stats().mounts, 2); f.manager.dispose(); assert.equal(f.listeners.size, 0);
});
test('page disposal cancels a pending module load', async () => {
  const f = fixture({ deferred: true }); f.manager.sync(); await flush();
  f.manager.dispose(); f.resolve(); await flush(); assert.equal(f.stats().mounts, 0);
});
test('DOM replacement preserves the existing canvas host by stable key', () => {
  const old = { dataset: { electricLogo: 'home' }, className: 'electric-brand' };
  const previous = captureElectricBrands({ querySelectorAll: () => [old] });
  let restored;
  restoreElectricBrands({ querySelectorAll: () => [{ ...old, replaceWith: node => { restored = node; } }] }, previous);
  assert.equal(restored, old);
});

test('glow uses the same image coordinates with asymmetric transparent margins', () => {
  const shape = { sourceWidth: 240, sourceHeight: 240, sourceLeft: 12, sourceTop: 36, pad: 50, logoWidth: 212, logoHeight: 198 };
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
  for (const [width, height, inset] of [[44, 46, 3], [40, 36, 1], [46, 48, 3], [48, 50, 3]]) {
    const placement = containLogoPlacement(shape, { width, height, left: inset, right: inset, top: inset, bottom: inset });
    const renderedSize = Math.min(width - inset * 2, height - inset * 2);
    // Compare a point in the upper emblem and one in the SPORTS lettering.
    for (const [sourceX, sourceY] of [[120, 45], [220, 226]]) {
      const x = placement.ox + (sourceX - shape.sourceLeft + shape.pad) * placement.fit;
      const y = placement.oy + (sourceY - shape.sourceTop + shape.pad) * placement.fit;
      near(x, (width - renderedSize) / 2 + sourceX / 240 * renderedSize);
      near(y, (height - renderedSize) / 2 + sourceY / 240 * renderedSize);
    }
  }
});

test('cropping the distance field never changes the rendered outline position', () => {
  const box = { width: 44, height: 46, left: 3, right: 3, top: 3, bottom: 3 };
  const source = { sourceWidth: 300, sourceHeight: 180, logoWidth: 240, logoHeight: 120 };
  const placements = [{ sourceLeft: 25, sourceTop: 32, pad: 60 }, { sourceLeft: 20, sourceTop: 28, pad: 70 }].map(crop => {
    const p = containLogoPlacement({ ...source, ...crop }, box);
    return [p.ox + (125 - crop.sourceLeft + crop.pad) * p.fit, p.oy + (140 - crop.sourceTop + crop.pad) * p.fit];
  });
  placements[0].forEach((value, i) => assert.ok(Math.abs(value - placements[1][i]) < 1e-9));
});
