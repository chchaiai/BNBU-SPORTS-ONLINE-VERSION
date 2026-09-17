import type { AiAssessment } from './domain/ai-review.js';

export const AI_REVIEW_PROVIDER = Symbol('AI_REVIEW_PROVIDER');
export interface AiReviewProvider {
  readonly enabled: boolean;
  readonly provider: string;
  readonly model: string;
  assess(input: { sport: string; images: readonly Buffer[]; sampledVideo: boolean; signal: AbortSignal }): Promise<AiAssessment>;
}

// A real adapter is enabled only after the operator approves the service, data use and cost.
export class DisabledAiReviewProvider implements AiReviewProvider {
  readonly enabled = false;
  readonly provider = 'DISABLED';
  readonly model = '';
  assess(): Promise<AiAssessment> { return Promise.reject(new Error('AI_PROVIDER_NOT_CONFIGURED')); }
}
