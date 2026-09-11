export const PUBLIC_REASONS = {
  UNCLEAR_EVIDENCE: ['材料不清晰', 'Unclear evidence'],
  MISSING_REQUIRED_EVIDENCE: ['必需材料缺失', 'Missing required evidence'],
  SESSION_MISMATCH: ['材料与本次运动不符', 'Evidence does not match this session'],
  INCONSISTENT_EVIDENCE: ['材料信息矛盾', 'Inconsistent evidence'],
  AUTHENTICITY_REQUIRES_CLARIFICATION: [
    '材料真实性待核实',
    'Evidence authenticity requires clarification',
  ],
  CONFIRMED_REUSE_OR_MISUSE: [
    '经核实存在重复使用或冒用材料',
    'Confirmed reuse or misuse of evidence',
  ],
} as const;
export type ReviewAction = 'VALID' | 'INVALID' | 'RETURN_FOR_SUPPLEMENT';
export function validateReview(input: {
  action: ReviewAction;
  reasonCode?: string | null;
  publicComment?: string | null;
  supplementHours?: number;
  supplementUsed: boolean;
  internalNote?: unknown;
}) {
  if (input.internalNote !== undefined && input.internalNote !== null)
    throw new Error('HIDDEN_REVIEW_NOTE_FORBIDDEN');
  if (!['VALID', 'INVALID', 'RETURN_FOR_SUPPLEMENT'].includes(input.action))
    throw new Error('INVALID_REVIEW_ACTION');
  if (input.action === 'VALID') {
    if (input.reasonCode) throw new Error('VALID_REASON_FORBIDDEN');
  } else {
    if (!input.reasonCode || !Object.hasOwn(PUBLIC_REASONS, input.reasonCode))
      throw new Error('PUBLIC_REASON_REQUIRED');
    if (input.action === 'INVALID' && input.reasonCode === 'AUTHENTICITY_REQUIRES_CLARIFICATION')
      throw new Error('REASON_ACTION_MISMATCH');
    if (input.action === 'RETURN_FOR_SUPPLEMENT') {
      if (input.reasonCode === 'CONFIRMED_REUSE_OR_MISUSE')
        throw new Error('REASON_ACTION_MISMATCH');
      if (input.supplementUsed) throw new Error('SUPPLEMENT_ALREADY_USED');
      if (![24, 72].includes(input.supplementHours ?? 24))
        throw new Error('INVALID_SUPPLEMENT_WINDOW');
    }
  }
  return {
    action: input.action,
    reasonCode: input.reasonCode ?? null,
    publicComment: input.publicComment?.trim() || null,
    supplementHours:
      input.action === 'RETURN_FOR_SUPPLEMENT' ? (input.supplementHours ?? 24) : null,
  };
}
