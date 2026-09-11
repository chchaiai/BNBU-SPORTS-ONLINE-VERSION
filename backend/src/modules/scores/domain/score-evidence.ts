export function isSafeScoreEvidenceReference(value: string): boolean {
  return (
    !/^(?:https?|javascript|data|file):/iu.test(value) &&
    !value.includes('..') &&
    !value.includes('\\')
  );
}
