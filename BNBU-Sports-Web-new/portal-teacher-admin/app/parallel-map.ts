/** Bound read concurrency without changing input order or hiding failures. */
export async function parallelMap<T, U>(items: readonly T[], read: (item: T) => Promise<U>, concurrency = 6): Promise<U[]> {
  const results = new Array<U>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await read(items[index]);
    }
  }));
  return results;
}
