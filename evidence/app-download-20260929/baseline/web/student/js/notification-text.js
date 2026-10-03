// Render immutable review facts; never infer a historical result from current state.
const titles = {
  VALID: ["运动记录有效", "Exercise record accepted"],
  INVALID: ["运动记录无效", "Exercise record invalid"],
  AWAITING_SUPPLEMENT: ["请补充本次运动材料", "Supplementary evidence required"],
  PENDING_TEACHER: ["补证已受理，等待教师复核", "Supplement received, awaiting teacher review"],
};
const reasons = {
  UNCLEAR_EVIDENCE: ["材料不清晰", "Unclear evidence"],
  MISSING_REQUIRED_EVIDENCE: ["必需材料缺失", "Missing required evidence"],
  SESSION_MISMATCH: ["材料与本次运动不符", "Evidence does not match this session"],
  INCONSISTENT_EVIDENCE: ["材料信息矛盾", "Inconsistent evidence"],
  AUTHENTICITY_REQUIRES_CLARIFICATION: ["材料真实性待核实", "Evidence authenticity requires clarification"],
  CONFIRMED_REUSE_OR_MISUSE: ["经核实存在重复使用或冒用材料", "Confirmed reuse or misuse of evidence"],
  SUPPLEMENT_DEADLINE_MISSED: ["补证逾期", "Supplementary evidence deadline missed"],
};

export function notificationText(notice, localize) {
  const fallback = { title: String(notice.title || ""), message: String(notice.message || "") };
  const facts = notice.reviewContent;
  if (notice.notificationType !== "EXERCISE_RECORD_RESULT" || !facts || facts.version !== 1 ||
      !Object.hasOwn(titles, facts.stage) ||
      (facts.reasonCode !== null && !Object.hasOwn(reasons, facts.reasonCode)) ||
      (facts.publicComment !== null && typeof facts.publicComment !== "string")) return fallback;
  const title = localize(...titles[facts.stage]);
  const reason = facts.reasonCode === null ? null : localize(...reasons[facts.reasonCode]);
  return { title, message: [reason, facts.publicComment].filter(value => value !== null && value !== "").join("\n") || title };
}
