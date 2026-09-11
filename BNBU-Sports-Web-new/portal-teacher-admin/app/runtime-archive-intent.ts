export type RuntimeArchiveIntent = { key: string; filters: { startDate: string; endDate: string } };

export function loadRuntimeArchiveIntent(userId: string | null, storage?: Storage) {
  const key = `bnbu-runtime-archive-pending-v1:${userId}`;
  const result: { current: RuntimeArchiveIntent | null; error: Error | null; save: (next: RuntimeArchiveIntent | null) => void } = {
    current: null, error: null,
    save(next) {
      if (result.error) throw result.error;
      if (!userId || !storage) throw new Error('无法安全保存归档重试信息，请检查登录和浏览器存储。');
      if (next) storage.setItem(key, JSON.stringify(next));
      else storage.removeItem(key);
      result.current = next;
    },
  };
  try {
    if (!storage && typeof window !== 'undefined') storage = window.sessionStorage;
    const raw = userId && storage ? storage.getItem(key) : null;
    if (raw) {
      const value = JSON.parse(raw);
      if (!value || typeof value.key !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.key) ||
          !value.filters || !/^\d{4}-\d{2}-\d{2}$/.test(value.filters.startDate) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(value.filters.endDate)) throw new Error('INVALID_PENDING_ARCHIVE');
      result.current = { key: value.key, filters: { startDate: value.filters.startDate, endDate: value.filters.endDate } };
    }
  } catch {
    result.error = new Error('归档待确认请求无法读取，请保留当前浏览器数据并检查浏览器存储。');
  }
  return result;
}
