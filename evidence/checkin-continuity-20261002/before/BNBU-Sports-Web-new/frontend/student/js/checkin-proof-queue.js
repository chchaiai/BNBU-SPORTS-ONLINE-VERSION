import {tx} from './i18n.js';
import {esc} from './ui.js';
import {icon} from './icons.js';

// Presentation only. Verified media IDs and uploader checkpoints remain authoritative.
export function proofQueueState(draft, ui) {
  const active = ui.uploadDraftId === draft.id;
  const progress = active ? ui.uploadProgress : null;
  const preview = ui.previewTransfer === true || ui.previewTransfer === 'simulation' ? ui.previewProofStates?.[draft.id] : null;
  if (draft.mediaId || preview === 'saved') return {state:'verified', label:preview && ui.previewTransfer === true ? tx('已保存','Saved') : tx('已验证','Verified'), transferred:true};
  const terminalFailure = draft.processingFailure || draft.pendingUpload?.verificationStatus === 'FAILED';
  const retrying = active && ui.finish.submitting && progress?.phase !== 'FAILED';
  if (terminalFailure || (!retrying && (draft.uploadFailure || active && ui.finish.error))) {
    return {state:'failed', label:terminalFailure ? tx('校验失败','Verification failed') : tx('需重试','Retry needed'), transferred:Boolean(draft.pendingUpload?.objectUploaded),
      message:active && ui.finish.error ? ui.finish.error.message : tx('点击凭证查看详情，原件已保留。','Open for details. The original is retained.')};
  }
  if (active && progress?.phase === 'UPLOADING') {
    const percent = Number.isFinite(progress.percent) ? Math.max(0,Math.min(100,progress.percent)) : null;
    return {state:'uploading', label:percent === null ? tx('上传中','Uploading') : `${Math.floor(percent)}%`, percent, transferred:percent === 100};
  }
  if (active && ['CONFIRMING','PROCESSING','SUCCESS'].includes(progress?.phase) || draft.pendingUpload?.objectUploaded || draft.pendingUpload?.confirmed || draft.pendingUpload?.bound) {
    return {state:'verifying', label:tx('确认中','Verifying'), transferred:true};
  }
  if (active && ui.finish.submitting) return {state:'preparing',label:ui.previewTransfer === true ? tx('保存中','Saving') : tx('准备中','Preparing'),transferred:false};
  return {state:'waiting',label:ui.finish.submitting ? tx('等待上传','Waiting') : tx('待提交','Ready'),transferred:false};
}

export function proofQueueRowHtml(draft, ui, {media, title, metadata}) {
  const status = proofQueueState(draft,ui);
  const busy = ['uploading','preparing','verifying'].includes(status.state);
  const bar = status.state === 'uploading' ? `<span class="proof-queue-track${status.percent === null ? ' is-indeterminate' : ''}" role="progressbar" aria-label="${esc(title)}${tx('上传进度',' upload progress')}" aria-valuemin="0" aria-valuemax="100" ${status.percent === null ? '' : `aria-valuenow="${status.percent}"`}><span data-checkin-motion="upload-fill-${esc(draft.id)}" style="width:${status.percent ?? 30}%"></span></span>` : '';
  return `<li class="proof-queue-item" data-queue-state="${status.state}"><button class="proof-card proof-queue-row pressable" type="button" data-action="checkin.previewDraft" data-draft-id="${esc(draft.id)}" data-proof-type="${esc(draft.type)}" aria-label="${esc(`${tx('预览','Preview')} ${title}，${status.label}`)}">
    <span class="proof-queue-thumbnail">${media}</span><span class="proof-queue-copy"><strong>${esc(title)}</strong><small>${esc(metadata)}</small></span>
    <span class="proof-queue-status">${status.state === 'verified' ? icon('check',15) : busy && status.state !== 'uploading' ? '<i class="proof-queue-dot" aria-hidden="true"></i>' : ''}${esc(status.label)}</span>
  </button>${bar}${status.message ? `<p class="proof-queue-error" role="alert">${esc(status.message)}</p>` : ''}</li>`;
}

export function proofQueueStage(ui) {
  if (ui.uploadProgress?.phase === 'SUBMITTING') return 2;
  return ui.drafts?.length && ui.drafts.every(draft=>proofQueueState(draft,ui).transferred) ? 1 : 0;
}

export function proofQueueFooterHtml(ui) {
  if (!ui.finish.submitting && !ui.finish.error) return ui.mediaNotice ? `<p class="checkin-note checkin-media-notice" data-checkin-upload-status role="status">${esc(ui.mediaNotice)}</p>` : '';
  const stage = proofQueueStage(ui);
  const rowError = ui.drafts?.some(draft=>proofQueueState(draft,ui).state === 'failed');
  const labels = ui.previewTransfer === true ? [tx('保存凭证','Save evidence'),tx('确认凭证','Check evidence'),tx('保存记录','Save record')] : [tx('上传凭证','Upload evidence'),tx('确认凭证','Verify evidence'),tx('提交记录','Submit record')];
  return `<div class="proof-queue-footer" data-checkin-motion="transfer" data-upload-phase="${esc(ui.uploadProgress?.phase || 'WAITING')}">
    <ol class="proof-queue-steps" aria-label="${tx('提交进度','Submission progress')}">${labels.map((label,index)=>`<li class="${index === stage ? 'is-current' : index < stage ? 'is-done' : ''}" ${index === stage ? 'aria-current="step"' : ''}><span aria-hidden="true">${index < stage ? icon('check',12) : index + 1}</span>${label}</li>`).join('')}</ol>
    ${ui.finish.error ? `<p class="proof-queue-feedback${rowError ? '' : ' is-error'}" role="${rowError ? 'status' : 'alert'}">${rowError ? tx('凭证和说明已保留，请重试。','Evidence and description are retained. Retry below.') : esc(ui.finish.error.message)}</p>` : `<p class="proof-queue-feedback" role="status">${ui.previewTransfer === true ? tx('本地体验 · 凭证与记录仅保存在此浏览器','Local preview · Saved only in this browser') : ui.previewTransfer === 'simulation' ? tx('本地示例 · 上传与确认均为演示','Local example · Simulated upload and verification') : ui.finish.submitting ? tx('请保持页面打开，确认完成后自动进入结果页。','Keep this page open. The result appears after confirmation.') : esc(ui.mediaNotice || '')}</p>`}
  </div>`;
}
