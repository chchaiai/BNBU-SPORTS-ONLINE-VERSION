export function categoryProgress(target: number, minutes: bigint | undefined, recognized: bigint | undefined) {
  const raw = Number(minutes ?? 0), recognitionRaw = Number(recognized ?? 0);
  if (!Number.isSafeInteger(target) || target < 0 || !Number.isSafeInteger(raw) || raw < 0 ||
    !Number.isSafeInteger(recognitionRaw) || recognitionRaw < 0) throw new Error('PROGRESS_ACCOUNTING_INVALID');
  const recognition = Math.min(target, recognitionRaw), credited = Math.min(target - recognition, raw);
  return { targetSeconds: target * 60, validExerciseSeconds: credited * 60, recognizedSeconds: recognition * 60,
    effectiveSeconds: (credited + recognition) * 60, remainingSeconds: (target - credited - recognition) * 60 };
}
export function exerciseAccounting(records: readonly { actualSeconds: number; creditedSeconds: number;
  decision: 'VALID' | 'INVALID' | 'PENDING' }[]) {
  let actualSeconds = 0, invalidActualSeconds = 0, validUncreditedSeconds = 0, creditedSeconds = 0, pendingActualSeconds = 0;
  for (const record of records) {
    if (!Number.isSafeInteger(record.actualSeconds) || record.actualSeconds < 0 || !Number.isSafeInteger(record.creditedSeconds) ||
      record.creditedSeconds < 0 || record.creditedSeconds > record.actualSeconds ||
      (record.decision !== 'VALID' && record.creditedSeconds !== 0)) throw new Error('PROGRESS_ACCOUNTING_INVALID');
    actualSeconds += record.actualSeconds;
    if (record.decision === 'INVALID') invalidActualSeconds += record.actualSeconds;
    else if (record.decision === 'PENDING') pendingActualSeconds += record.actualSeconds;
    else { creditedSeconds += record.creditedSeconds; validUncreditedSeconds += record.actualSeconds - record.creditedSeconds; }
  }
  if (!Number.isSafeInteger(actualSeconds)) throw new Error('PROGRESS_ACCOUNTING_OVERFLOW');
  return { actualSeconds, invalidActualSeconds, validUncreditedSeconds, creditedSeconds, pendingActualSeconds };
}
