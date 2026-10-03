import test from 'node:test';
import assert from 'node:assert/strict';
import { createElectricBrandManager, captureElectricBrands, restoreElectricBrands } from './js/electric-brand.js';

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
