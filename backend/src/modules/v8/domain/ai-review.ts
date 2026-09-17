export const AI_FLAGS = ['UNSAFE_CONTENT', 'NO_EXERCISE', 'SPORT_MISMATCH', 'EXACT_DUPLICATE', 'POSSIBLE_DUPLICATE', 'INSUFFICIENT_EVIDENCE', 'VIDEO_SAMPLED'] as const;
export type AiFlag = (typeof AI_FLAGS)[number];
export type AiRecommendation = 'SUGGEST_PASS' | 'TEACHER_REVIEW' | 'SUSPECTED_RISK';
export interface AiAssessment {
  contentSafety: 'SAFE' | 'UNSAFE' | 'UNCERTAIN';
  exercise: 'YES' | 'NO' | 'UNCERTAIN';
  sportMatch: 'YES' | 'NO' | 'UNCERTAIN';
  confidence: number;
}

export const AI_AUTO_POLICY = 'auto-decision-v2';
export function decideAiReview(assessment: AiAssessment, duplicate: boolean, sampledVideo: boolean): 'VALID' | 'INVALID' | null {
  if (duplicate || sampledVideo || assessment.confidence < 0.95 ||
    [assessment.contentSafety, assessment.exercise, assessment.sportMatch].includes('UNCERTAIN')) return null;
  if (assessment.exercise !== 'YES' || assessment.sportMatch !== 'YES') return null;
  if (assessment.contentSafety === 'UNSAFE') return 'INVALID';
  return 'VALID';
}

// Provider text is untrusted. Persist only bounded, known fields, never model actions.
export function parseAiAssessment(value: unknown): AiAssessment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('AI_RESPONSE_INVALID');
  const row = value as Record<string, unknown>;
  if (!['SAFE', 'UNSAFE', 'UNCERTAIN'].includes(String(row.contentSafety)) ||
    !['YES', 'NO', 'UNCERTAIN'].includes(String(row.exercise)) ||
    !['YES', 'NO', 'UNCERTAIN'].includes(String(row.sportMatch)) ||
    typeof row.confidence !== 'number' || !Number.isFinite(row.confidence) || row.confidence < 0 || row.confidence > 1) {
    throw new Error('AI_RESPONSE_INVALID');
  }
  return { contentSafety: row.contentSafety as AiAssessment['contentSafety'], exercise: row.exercise as AiAssessment['exercise'],
    sportMatch: row.sportMatch as AiAssessment['sportMatch'], confidence: row.confidence };
}

export function recommendAiReview(assessment: AiAssessment, duplicate: boolean, sampledVideo: boolean): { recommendation: AiRecommendation; flags: AiFlag[] } {
  const flags: AiFlag[] = [];
  if (assessment.contentSafety === 'UNSAFE') flags.push('UNSAFE_CONTENT');
  if (assessment.exercise === 'NO') flags.push('NO_EXERCISE');
  if (assessment.sportMatch === 'NO') flags.push('SPORT_MISMATCH');
  if (duplicate) flags.push('EXACT_DUPLICATE');
  if (assessment.confidence < 0.85 || [assessment.contentSafety, assessment.exercise, assessment.sportMatch].includes('UNCERTAIN')) flags.push('INSUFFICIENT_EVIDENCE');
  if (sampledVideo) flags.push('VIDEO_SAMPLED');
  const risk = flags.some(flag => ['UNSAFE_CONTENT', 'NO_EXERCISE', 'SPORT_MISMATCH', 'EXACT_DUPLICATE'].includes(flag));
  return { recommendation: risk ? 'SUSPECTED_RISK' : flags.length ? 'TEACHER_REVIEW' : 'SUGGEST_PASS', flags };
}
