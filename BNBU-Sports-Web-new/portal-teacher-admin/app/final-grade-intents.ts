export type FinalGradeIntent = {
  input: { finalGrade: number; published: boolean; expectedVersion: number; correctionReason?: string };
  key: string;
};

const prefix = 'bnbu-final-grade-pending-v1:';
export function loadFinalGradeIntents(userId: string | null, storage?: Storage) {
  const current = new Map<string, FinalGradeIntent>();
  let error: Error | null = null;
  try { if (!storage && typeof window !== 'undefined') storage = window.sessionStorage; }
  catch { error = new Error('无法安全保存成绩重试信息，请检查浏览器存储。'); }
  if (userId && storage) {
    try {
      const raw = storage.getItem(prefix + userId);
      if (raw) {
        const entries: unknown = JSON.parse(raw);
        if (!Array.isArray(entries)) throw new Error('成绩待确认请求无法读取，请保留当前浏览器数据并联系管理员。');
        for (const entry of entries) {
          const [id, intent] = Array.isArray(entry) ? entry : [];
          if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id) || current.has(id) ||
              !intent || typeof intent.key !== 'string' || !/^[0-9a-f-]{36}$/i.test(intent.key) ||
              !intent.input || !Number.isInteger(intent.input.finalGrade) ||
              intent.input.finalGrade < -2147483648 || intent.input.finalGrade > 2147483647 ||
              typeof intent.input.published !== 'boolean' || !Number.isSafeInteger(intent.input.expectedVersion) || intent.input.expectedVersion < 0 ||
              (intent.input.correctionReason !== undefined && (typeof intent.input.correctionReason !== 'string' || !intent.input.correctionReason.trim() || intent.input.correctionReason.length > 1000 || intent.input.expectedVersion < 1))) {
            throw new Error('成绩待确认请求无法读取，请保留当前浏览器数据并联系管理员。');
          }
          current.set(id, intent);
        }
      }
    } catch (failure) { error = failure instanceof Error ? failure : new Error('无法读取成绩待确认请求。'); }
  }
  const save = () => {
    if (error) throw error;
    if (!userId || !storage) throw new Error('无法安全保存成绩重试信息，请检查登录和浏览器存储。');
    if (current.size) storage.setItem(prefix + userId, JSON.stringify([...current]));
    else storage.removeItem(prefix + userId);
  };
  return { current, save, error };
}
