// StatusMark's geometry, adapted to the student's persistent, framework-free DOM.
// A completed byte transfer remains running until evidence is confirmed.
export function proofStatusMark(status) {
  const state=status.state === 'verified' ? 'done' : status.state === 'failed' ? 'failed'
    : ['preparing','uploading','verifying'].includes(status.state) ? 'running' : 'pending';
  const determinate=state === 'running' && status.state === 'uploading' && Number.isFinite(status.percent);
  const indeterminate=state === 'running' && !determinate;
  const circumference=2*Math.PI*9;
  const arc=indeterminate ? .68 : determinate ? Math.max(0,Math.min(100,status.percent))/100 : 1;
  const dash=state === 'pending' ? .3*circumference/8 : arc*circumference;
  const gap=state === 'pending' ? .7*circumference/8 : (1-arc)*circumference;
  return {state,indeterminate,dash:`${dash.toFixed(4)} ${gap.toFixed(4)}`};
}

export function proofStatusMarkHtml(status) {
  const mark=proofStatusMark(status);
  return `<span class="proof-status-mark" data-status="${mark.state}" data-indeterminate="${mark.indeterminate}" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20"><circle class="proof-status-track" cx="12" cy="12" r="9"/><g class="proof-status-rotor"><circle class="proof-status-ring" cx="12" cy="12" r="9" transform="rotate(-90 12 12)" stroke-dasharray="${mark.dash}"/></g><path class="proof-status-check" d="M7.5 12.25 10.5 15.25 16.75 8.75" pathLength="1"/><path class="proof-status-cross" d="M8.5 8.5 15.5 15.5M15.5 8.5 8.5 15.5" pathLength="1"/></svg></span>`;
}

export function updateProofStatusMark(el,status) {
  if(!el)return;
  const mark=proofStatusMark(status);
  el.dataset.status=mark.state;
  el.dataset.indeterminate=String(mark.indeterminate);
  el.querySelector('.proof-status-ring').setAttribute('stroke-dasharray',mark.dash);
}
