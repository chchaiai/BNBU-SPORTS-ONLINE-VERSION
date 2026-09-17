// A server-accepted batch is immutable, including across response loss/reloads.
// Swimming now follows the shared evidence and submission rules.
export const isRealtimeSwim = () => false;

export function swimPhaseError(drafts) {
  const images = drafts.filter(d => d.type === 'image');
  if (images.length < 2 || !images.some(d => d.swimPhase === 'BEFORE') || !images.some(d => d.swimPhase === 'AFTER')) return 'SWIM_BEFORE_AFTER_REQUIRED';
  if (images.some(d => d.swimPhase === 'BEFORE' && d.capturedAfterEnd)) return 'SWIM_ORIGINAL_BEFORE_AFTER_REQUIRED';
  return null;
}

export async function ensureSwimIntake({record, drafts, intent, delayReason, get, prepare, accept, save, fail}) {
  let intake;
  try { intake = await get(record.id); }
  catch (error) { if (error.status !== 404) throw error; }
  if (!intake) {
    const reason = swimPhaseError(drafts);
    if (reason) throw fail(reason);
    for (const draft of drafts) {
      try { if (!draft.mediaId) await prepare(draft); }
      finally { await save(draft); }
    }
    const items = drafts.map(d => ({mediaId: d.mediaId || d.pendingUpload.initiated.mediaId, phase: d.type === 'video' ? 'OTHER' : d.swimPhase || 'OTHER'}));
    const fingerprint = JSON.stringify({items, delayReason: delayReason?.trim() || ''});
    if (intent.swimFingerprint !== fingerprint) {
      intent.swimFingerprint = fingerprint;
      intent.swimKey = crypto.randomUUID();
    }
    await save();
    for (const draft of drafts) { draft.swimLocked = true; await save(draft); }
    try { intake = await accept(record.id, items, record.version, delayReason, intent.swimKey); }
    catch (error) {
      // A lost response may already have committed. Keep that batch locked.
      if (error.status >= 400 && error.status < 500 && error.status !== 409) {
        for (const draft of drafts) { draft.swimLocked = false; await save(draft); }
      }
      throw error;
    }
  }
  const ids = drafts.map(d => d.mediaId || d.pendingUpload?.initiated?.mediaId);
  if (intake.items.length !== drafts.length || intake.items.some(i => !ids.includes(i.mediaId))) throw fail('SWIM_LOCKED_BATCH_MISMATCH');
  for (const draft of drafts) {
    draft.swimPhase = intake.items.find(i => i.mediaId === (draft.mediaId || draft.pendingUpload?.initiated?.mediaId)).phase;
    draft.swimLocked = true;
    await save(draft);
  }
  if (!intent.swimAccepted) {
    // A pre-fix submit key may cache SWIM_INTAKE_REQUIRED permanently.
    intent.submitKey = crypto.randomUUID();
    intent.swimAccepted = true;
  }
  await save();
  return intake;
}
