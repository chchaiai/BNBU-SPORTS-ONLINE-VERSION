import type { V81CompositeRosterService } from '../v81-composite-roster.js';
type Row = Awaited<ReturnType<V81CompositeRosterService['preview']>>['rows'][number];
// Explicit public fields at every level; never spread a teacher report row into a student response.
export function studentSettlementResult(row: Row) {
  const p = row.progress, physical = row.physical, raw = physical?.result;
  const category = (value: NonNullable<Row['progress']>['course']) => ({ targetSeconds: value.targetSeconds,
    validExerciseSeconds: value.validExerciseSeconds, recognizedSeconds: value.recognizedSeconds,
    effectiveSeconds: value.effectiveSeconds, remainingSeconds: value.remainingSeconds });
  return { registrationStatus: row.status, pendingCount: row.pendingCount,
    physical: physical ? { status: physical.status, result: raw ? { version: raw.version, runType: raw.runType,
      elapsedSeconds: raw.elapsedSeconds, testedOn: raw.testedOn } : null } : null,
    progress: p ? { actualSeconds: p.actualSeconds, invalidActualSeconds: p.invalidActualSeconds,
      validUncreditedSeconds: p.validUncreditedSeconds, creditedSeconds: p.creditedSeconds,
      pendingActualSeconds: p.pendingActualSeconds, course: category(p.course), general: category(p.general),
      remainingSeconds: p.remainingSeconds, targetReached: p.targetReached } : null };
}
