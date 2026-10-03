import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAccountsCache } from '../app/admin-accounts-cache.ts';

test('opening accounts shares prefetch and reuses its completed result', async () => {
  let calls = 0;
  let resolve;
  const cache = createAccountsCache(() => { calls++; return new Promise(r => { resolve = r; }); });
  const preload = cache.load();
  assert.equal(cache.load(), preload);
  await Promise.resolve();
  resolve({ students: ['student'], teachers: ['teacher'] });
  const result = await preload;
  assert.equal(cache.peek(), result);
  assert.equal(await cache.load(), result);
  assert.equal(calls, 1);
});

test('failed prefetch retries; stale data expires; workspace caches are isolated', async () => {
  let calls = 0;
  let time = 0;
  const cache = createAccountsCache(async () => { if (++calls === 1) throw Error('offline'); return calls; }, () => time);
  await assert.rejects(cache.load(), /offline/);
  assert.equal(await cache.load(), 2);
  time = 60_001;
  assert.equal(cache.peek(), 2);
  assert.equal(await cache.load(), 3);
  const other = createAccountsCache(async () => 99);
  assert.equal(other.peek(), undefined);
  assert.equal(await other.load(), 99);
  assert.equal(cache.peek(), 3);
});

test('mutation refresh supersedes an older pending request', async () => {
  const resolvers = [];
  const cache = createAccountsCache(() => new Promise(resolve => resolvers.push(resolve)));
  const old = cache.load();
  await Promise.resolve();
  const fresh = cache.load(true);
  await Promise.resolve();
  resolvers[1]('updated');
  await fresh;
  resolvers[0]('outdated');
  await old;
  assert.equal(cache.peek(), 'updated');
  assert.equal(await cache.load(), 'updated');
});
