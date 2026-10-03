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
  const uploading = status.state === 'uploading';
  const bar = `<span class="proof-queue-track${uploading && status.percent === null ? ' is-indeterminate' : ''}" ${uploading ? 'role="progressbar"' : 'aria-hidden="true"'} aria-label="${esc(title)}${tx('上传进度',' upload progress')}" aria-valuemin="0" aria-valuemax="100" ${uploading && status.percent !== null ? `aria-valuenow="${status.percent}"` : ''}><span style="width:${uploading ? status.percent ?? 30 : status.transferred ? 100 : 0}%"></span></span>`;
  return `<li class="proof-queue-item" data-queue-id="${esc(draft.id)}" data-queue-state="${status.state}"><button class="proof-card proof-queue-row pressable" type="button" data-action="checkin.previewDraft" data-draft-id="${esc(draft.id)}" data-proof-type="${esc(draft.type)}" data-proof-title="${esc(title)}" aria-label="${esc(`${tx('预览','Preview')} ${title}，${status.label}`)}">
    <span class="proof-queue-thumbnail">${media}</span><span class="proof-queue-copy"><strong>${esc(title)}</strong><small>${esc(metadata)}</small></span>
    <span class="proof-queue-status">${queueStatusHtml(status)}</span>
  </button>${bar}${status.message ? `<p class="proof-queue-error" role="alert">${esc(status.message)}</p>` : ''}</li>`;
}

function queueStatusHtml(status) {
  return `${status.state === 'verified' ? icon('check',15) : ['preparing','verifying'].includes(status.state) ? '<i class="proof-queue-dot" aria-hidden="true"></i>' : ''}<span>${esc(status.label)}</span>`;
}

// Preserve the row, image, progress track, focused control and active animation.
// Only an existing submitting queue is eligible; structural changes use render().
export function updateProofQueue(root, ui) {
  if (!root || !ui?.finish.submitting || ui.finish.error || !root.querySelector('.checkin-finished.is-submitting')) return false;
  const rows = [...root.querySelectorAll('.proof-queue-item[data-queue-id]')].filter(row => !row.hasAttribute('data-motion-ghost'));
  const footer = root.querySelector('.proof-queue-footer');
  if (!footer || rows.length !== ui.drafts.length || rows.some((row, i) => row.dataset.queueId !== ui.drafts[i].id)) return false;
  // Validate before patching, so a fallback cannot leave a half-updated queue.
  const updates = rows.map((row, i) => ({row, status:proofQueueState(ui.drafts[i], ui)}));
  if (updates.some(({status}) => status.state === 'failed')) return false;
  for (const {row, status} of updates) {
    const changed = row.dataset.queueState !== status.state;
    const button = row.querySelector('.proof-queue-row'), label = row.querySelector('.proof-queue-status');
    if (changed) {
      label.innerHTML = queueStatusHtml(status);
      row.dataset.queueState = status.state;
    } else if (label.lastElementChild.textContent !== status.label) label.lastElementChild.textContent = status.label;
    button.setAttribute('aria-label', `${tx('预览','Preview')} ${button.dataset.proofTitle}，${status.label}`);
    const track = row.querySelector('.proof-queue-track'), fill = track.firstElementChild;
    const uploading = status.state === 'uploading';
    track.classList.toggle('is-indeterminate', uploading && status.percent === null);
    if (uploading) {
      track.setAttribute('role','progressbar'); track.removeAttribute('aria-hidden');
      if (status.percent === null) track.removeAttribute('aria-valuenow');
      else track.setAttribute('aria-valuenow', String(status.percent));
      fill.style.width = `${status.percent ?? 30}%`;
    } else {
      track.removeAttribute('role'); track.removeAttribute('aria-valuenow'); track.setAttribute('aria-hidden','true');
      if (status.transferred) fill.style.width = '100%';
    }
  }
  const stage = proofQueueStage(ui);
  for (const [index, step] of [...footer.querySelectorAll('.proof-queue-steps li')].entries()) {
    const state = index === stage ? 'is-current' : index < stage ? 'is-done' : '';
    if (step.className !== state) {
      step.className = state;
      step.firstElementChild.innerHTML = index < stage ? icon('check',12) : String(index + 1);
    }
    if (index === stage) step.setAttribute('aria-current','step'); else step.removeAttribute('aria-current');
  }
  footer.dataset.uploadPhase = ui.uploadProgress?.phase || 'WAITING';
  return true;
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
