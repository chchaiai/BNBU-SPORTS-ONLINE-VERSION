// Loopback preview only. Durable local acknowledgment is separate from server submission.
export function experienceRecord({session,drafts,minimumMinutes,sportLabel,businessDate,submittedAt}) {
  if (session?.phase !== 'finished' || !Number.isFinite(minimumMinutes) || minimumMinutes <= 0 || session.activeDurationMillis < minimumMinutes * 60000) throw new Error('运动时长未达到最低要求。');
  const description = session.details?.description?.trim();
  if (!description || description.length > 200) throw new Error('请填写 1–200 字的运动说明。');
  if (!drafts.length || drafts.some(d=>!(d.blob instanceof Blob) || d.normalizationPending)) throw new Error('请保留至少一项已完成处理的运动凭证。');
  const course = session.details.creditType === 'course';
  return {id:`local-checkin-${session.startedAt}`,sessionId:`local-session-${session.startedAt}`,version:1,
    creditType:session.details.creditType,sportCode:session.details.sportType,sportType:sportLabel,
    enrollmentId:course ? 'preview-enrollment' : null,courseId:course ? 'preview-course' : null,classSectionId:course ? 'preview-section' : null,
    hours:null,creditedWholeMinutes:null,actualDurationSeconds:Math.floor(session.activeDurationMillis/1000),
    businessDate,submittedAt,startTime:new Date(session.startedAt).toISOString(),endTime:new Date(session.endedAt).toISOString(),
    note:description,description,taskTitle:'运动打卡',workflowStage:'PENDING_TEACHER',materialVersion:1,
    reviewResult:null,reviewStatus:'PENDING_TEACHER',serverStatus:'SUBMITTED',teacherPublicFeedback:null,
    reviewPublicComment:'本地体验记录，审核状态为示例。',proofSummary:'凭证已保存在本机',
    proofPhotoCount:drafts.filter(d=>d.type==='image').length,proofVideoCount:drafts.filter(d=>d.type==='video').length,
    proofIds:drafts.map(d=>d.id),proofFiles:[],serverProofsLoaded:true,localPreview:true};
}

export async function saveExperienceRecord({record,drafts,storage,onProgress=()=>{}}) {
  const existing = await storage.findRecord(record.id);
  if (existing) return {record:existing,created:false};
  const retained = await storage.proofIds(record.id);
  for (const draft of drafts) {
    onProgress({phase:'READING',draftId:draft.id});
    if (!retained.includes(draft.id)) await storage.saveProof(record.id,draft);
    onProgress({phase:'SAVED',draftId:draft.id});
  }
  onProgress({phase:'CONFIRMING',draftId:null});
  const savedIds = await storage.proofIds(record.id);
  if (record.proofIds.some(id=>!savedIds.includes(id))) throw new Error('凭证尚未完整保存，请重试。');
  onProgress({phase:'SUBMITTING',draftId:null});
  await storage.commitRecord(record);
  const saved = await storage.findRecord(record.id);
  if (!saved) throw new Error('记录尚未保存成功，请重试。');
  return {record:saved,created:true};
}
