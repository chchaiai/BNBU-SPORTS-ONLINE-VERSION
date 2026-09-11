import { getAccountSecurity, request } from './api-client';
import type { AdminState, EnduranceRule, EnduranceRuleInput } from './admin-types';
type EnduranceTable = {
  id: string; gender: EnduranceRule['gender']; gradeGroup: EnduranceRule['gradeGroup']; runType: EnduranceRule['runType'];
  version: number; updatedAt: string | null;
  bands: Omit<EnduranceRule, 'gender' | 'gradeGroup' | 'runType' | 'updatedAt' | 'tableVersion'>[];
};
const pendingIntents = new WeakMap<AdminState, Map<string, string>>();
const project = (table: EnduranceTable): EnduranceRule[] => table.bands.map(band => ({ ...band,
  gender: table.gender, gradeGroup: table.gradeGroup, runType: table.runType,
  updatedAt: table.updatedAt ?? new Date(0).toISOString(), tableVersion: table.version }));
export async function loadRealEnduranceRules() {
  const security = await getAccountSecurity();
  if (security.adminKind !== 'SUPER' && !security.permissions.includes('GLOBAL_RULES')) return [];
  return (await request<EnduranceTable[]>('/admin/endurance-tables')).flatMap(project);
}
export async function writeRealEnduranceRule(state: AdminState, input: EnduranceRuleInput | string, selectedVersion?: number) {
  const deleting = typeof input === 'string';
  const existing = deleting ? state.enduranceRules.find(rule => rule.id === input) : undefined;
  const source = deleting ? existing : input;
  if (!source) throw new Error('ENDURANCE_RULE_NOT_FOUND');
  const table = state.enduranceRules.find(rule => rule.gender === source.gender && rule.gradeGroup === source.gradeGroup && rule.runType === source.runType);
  if (table?.tableVersion === undefined) throw new Error('ENDURANCE_TABLE_NOT_LOADED');
  const tableKey = { gender: source.gender, gradeGroup: source.gradeGroup, runType: source.runType,
    expectedVersion: selectedVersion ?? source.tableVersion ?? table.tableVersion };
  const route = deleting ? `/admin/endurance-tables/rules/${encodeURIComponent(source.id!)}/delete`
    : `/admin/endurance-tables/rules${source.id ? `/${encodeURIComponent(source.id)}` : ''}`;
  const body = deleting ? tableKey : { ...tableKey, minSeconds: source.minSeconds, maxSeconds: source.maxSeconds,
    score: source.score, tier: source.tier, note: source.note };
  const intent = JSON.stringify({ route, body });
  const intents = pendingIntents.get(state) ?? new Map<string, string>();
  pendingIntents.set(state, intents);
  const key = intents.get(intent) ?? crypto.randomUUID();
  intents.set(intent, key);
  const result = await request<EnduranceTable>(route, { method: 'POST', body, headers: { 'Idempotency-Key': key } });
  intents.delete(intent);
  const rules = project(result);
  return { state: { ...state, enduranceRules: state.enduranceRules.filter(rule => !(rule.gender === result.gender &&
    rule.gradeGroup === result.gradeGroup && rule.runType === result.runType)).concat(rules) },
    value: deleting ? existing! : rules.find(rule => source.id ? rule.id === source.id : !state.enduranceRules.some(old => old.id === rule.id))! };
}
