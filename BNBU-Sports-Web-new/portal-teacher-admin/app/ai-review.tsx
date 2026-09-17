export type AiReview = {
  status: string;
  materialVersion: number;
  recommendation: 'SUGGEST_PASS' | 'TEACHER_REVIEW' | 'SUSPECTED_RISK' | null;
  flags: string[];
  completedAt: string | null;
  errorCode: string | null;
  policyVersion: string;
};
export const aiReviewLabels = { SUGGEST_PASS: '建议通过', TEACHER_REVIEW: '需要教师复核', SUSPECTED_RISK: '疑似异常/违规' };
const flags: Record<string, string> = {
  UNSAFE_CONTENT: '内容安全风险', NO_EXERCISE: '未发现明确运动行为', SPORT_MISMATCH: '运动项目可能不符',
  EXACT_DUPLICATE: '发现相同材料，需核实是否重复使用', POSSIBLE_DUPLICATE: '材料疑似相似',
  INSUFFICIENT_EVIDENCE: '证据不足或模型无法确认', VIDEO_SAMPLED: '视频仅抽帧检查，未覆盖音频与间隔画面',
};
export function AiReviewPanel({ review }: { review?: AiReview | null }) {
  const ready = review?.status === 'SUCCEEDED' && review.recommendation;
  const label = ready ? aiReviewLabels[review.recommendation!] : review?.status === 'FAILED' ? 'AI 初审暂不可用，请人工审核'
    : review?.status === 'RUNNING' ? 'AI 正在初审，可先人工审核' : review?.status === 'QUEUED' ? 'AI 等待初审，可先人工审核' : '暂无 AI 初审结果';
  return <section className="ai-review-panel" data-ai-recommendation={ready ? review.recommendation : 'PENDING'} aria-label="AI 初审建议">
    <strong>{ready ? review.recommendation === 'SUGGEST_PASS' ? '🟢 ' : review.recommendation === 'SUSPECTED_RISK' ? '🔴 ' : '🟡 ' : ''}{label}</strong>
    {review && <small>材料版本 {review.materialVersion}{review.completedAt ? ` · ${new Date(review.completedAt).toLocaleString()}` : ''}</small>}
    {ready && review.flags.length > 0 && <ul>{review.flags.map(flag => <li key={flag}>{flags[flag] ?? '需要人工核实'}</li>)}</ul>}
    <p>普通首次打卡默认有效；AI 异常进入教师复核。历史补卡和补证仍须人工审核。AI 不直接判无效。</p>
    <small>以上内容为AI生成，不代表开发者立场，请勿删除或修改本标记</small>
  </section>;
}
