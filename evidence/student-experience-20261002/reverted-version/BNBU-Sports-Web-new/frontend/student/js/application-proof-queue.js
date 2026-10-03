import {tx} from './i18n.js';
import {esc} from './ui.js';
import {icon} from './icons.js';
import {uploadProgressLabel} from './upload-progress.js';

export function applicationProofStatus(proof) {
  if (proof.mediaId) return {phase:'SAVED',label:tx('已上传 · 待提交申请','Uploaded · application not yet submitted'),percent:null};
  const phase = proof.transfer?.phase || 'READY';
  const percent = phase === 'UPLOADING' && Number.isFinite(proof.transfer.percent) ? Math.max(0,Math.min(100,Math.floor(proof.transfer.percent))) : null;
  const label = phase === 'READY' ? tx('已添加','Added') : phase === 'SUCCESS' ? tx('正在确认材料…','Verifying material…') : uploadProgressLabel({phase,percent});
  return {phase,label,percent};
}
export function applicationProofStatusHtml(proof) {
  const {phase,label,percent} = applicationProofStatus(proof);
  return `<span class="application-proof-status is-${phase.toLowerCase()}">${phase === 'SAVED' ? icon('check-circle',15) : ''}${esc(label)}</span>${percent !== null ? `<span class="application-proof-meter" role="progressbar" aria-label="${esc(proof.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></span>` : ''}`;
}
