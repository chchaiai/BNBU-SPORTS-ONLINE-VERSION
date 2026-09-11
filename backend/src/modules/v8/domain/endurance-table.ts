export type EnduranceTableKey = {
  gender: 'male' | 'female'; gradeGroup: 'freshman_sophomore' | 'junior_senior'; runType: '800m' | '1000m';
};
export type EnduranceBand = { id: string; minSeconds: number; maxSeconds: number; score: number;
  tier: 'excellent' | 'good' | 'pass' | 'fail'; note: string };

export function enduranceTier(score: number): EnduranceBand['tier'] {
  return score >= 95 ? 'excellent' : score >= 92 ? 'good' : score >= 60 ? 'pass' : 'fail';
}

export function validateEnduranceTable(key: EnduranceTableKey, input: readonly EnduranceBand[]): EnduranceBand[] {
  if (!['male', 'female'].includes(key.gender) || !['freshman_sophomore', 'junior_senior'].includes(key.gradeGroup) ||
    key.runType !== (key.gender === 'male' ? '1000m' : '800m')) throw new Error('ENDURANCE_TABLE_COMBINATION');
  if (input.length === 0) throw new Error('ENDURANCE_TABLE_EMPTY');
  const rows = input.map(row => ({ ...row, note: row.note.trim() })).sort((a, b) => a.minSeconds - b.minSeconds);
  const ids = new Set<string>();
  for (const [index, row] of rows.entries()) {
    if (!row.id || ids.has(row.id)) throw new Error('ENDURANCE_RULE_ID');
    ids.add(row.id);
    if (!Number.isSafeInteger(row.minSeconds) || !Number.isSafeInteger(row.maxSeconds) ||
      row.minSeconds < 0 || row.maxSeconds < row.minSeconds) throw new Error('ENDURANCE_RULE_RANGE');
    if (!Number.isInteger(row.score) || row.score < 0 || row.score > 100) throw new Error('ENDURANCE_RULE_SCORE');
    if (row.tier !== enduranceTier(row.score)) throw new Error('ENDURANCE_RULE_TIER');
    const previous = rows[index - 1];
    if (previous && row.minSeconds !== previous.maxSeconds + 1) throw new Error('ENDURANCE_TABLE_CONTINUITY');
    if (previous && row.score > previous.score) throw new Error('ENDURANCE_TABLE_SCORE_ORDER');
  }
  return rows;
}

export function initialEnduranceBands(key: EnduranceTableKey, id: () => string): EnduranceBand[] {
  const top = (key.gender === 'male' ? 239 : 229) + (key.gradeGroup === 'junior_senior' ? 10 : 0);
  const rows: EnduranceBand[] = [{ id: id(), minSeconds: 0, maxSeconds: top, score: 100,
    tier: 'excellent', note: '国家学生体质健康标准满分区间' }];
  for (let score = 99; score >= 1; score--) {
    const minSeconds = top + 1 + (99 - score) * 3;
    rows.push({ id: id(), minSeconds, maxSeconds: minSeconds + 2, score, tier: enduranceTier(score), note: '' });
  }
  rows.push({ id: id(), minSeconds: top + 298, maxSeconds: 600, score: 0, tier: 'fail', note: '' });
  return validateEnduranceTable(key, rows);
}

export function convertEndurance(key: EnduranceTableKey, bands: readonly EnduranceBand[], seconds: number) {
  if (!Number.isSafeInteger(seconds) || seconds < 0) throw new Error('ENDURANCE_TIME_INVALID');
  const matches = validateEnduranceTable(key, bands).filter(row => seconds >= row.minSeconds && seconds <= row.maxSeconds);
  if (matches.length !== 1) throw new Error('ENDURANCE_TIME_UNMATCHED');
  return { ruleId: matches[0]!.id, score: matches[0]!.score, tier: matches[0]!.tier };
}
