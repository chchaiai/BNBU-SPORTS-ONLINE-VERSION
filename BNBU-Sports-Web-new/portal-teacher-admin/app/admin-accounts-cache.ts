// Each management workspace owns its cache; account data is never persisted.
export function createAccountsCache<T>(fetchData: () => Promise<T>, now = Date.now) {
  let cached: { value: T; at: number } | undefined;
  let pending: Promise<T> | undefined;
  let revision = 0;
  const peek = () => cached?.value;
  return {
    peek,
    load(force = false): Promise<T> {
      const value = peek();
      if (!force && value !== undefined && cached && now() - cached.at < 60_000) return Promise.resolve(value);
      if (!force && pending) return pending;
      const current = ++revision;
      const request = Promise.resolve().then(fetchData).then(result => {
        if (current === revision) cached = { value: result, at: now() };
        return result;
      }).finally(() => {
        if (current === revision) pending = undefined;
      });
      // A forced refresh invalidates old data even if the new request fails.
      if (force) cached = undefined;
      pending = request;
      return request;
    },
  };
}
