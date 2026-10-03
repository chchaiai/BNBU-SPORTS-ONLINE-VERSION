import { tx } from './i18n.js';

import { regions } from './region-catalog.js';

export const studentRegionOptions = () => regions.map(([value, zh, en]) => ({ value, label: tx(zh, en) }));
export function studentRegionLabel(code) { return studentRegionOptions().find(region => region.value === code)?.label || tx('未填写','Not provided'); }
