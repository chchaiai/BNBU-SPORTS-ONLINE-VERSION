// Format instants in the user's browser timezone; never display raw wire values.
export function formatLocalRecoveryTime(value, locale = 'zh') {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  if (locale.startsWith('en')) return new Intl.DateTimeFormat('en', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日${date.getHours()}点${String(date.getMinutes()).padStart(2, '0')}分`;
}
