import { tx } from './i18n.js';
import { icon } from './icons.js';

export const END_HOLD_MS = 2000;
// SlideCommit's capsule/wipe treatment, adapted to the existing hold gesture.
export function holdEndButtonHtml(disabled = false, pending = false) {
  return `<button type="button" class="checkin-end-btn checkin-hold-end" data-action="checkin.requestFinish" data-hold-end data-hold-phase="${pending ? 'pending' : 'idle'}" aria-label="${tx('长按结束运动', 'Hold to end exercise')}" aria-describedby="checkin-end-hint" ${pending ? 'aria-busy="true"' : ''} ${disabled ? 'disabled' : ''}>
    <span class="checkin-hold-copy" aria-hidden="true"><span data-hold-label>${tx('长按结束', 'Hold to end')}</span><small>${tx('按住 2 秒', 'Hold 2 seconds')}</small></span>
    <span class="checkin-hold-fill" data-hold-fill aria-hidden="true">
      <span class="checkin-hold-symbol">${icon('stop', 18)}</span>
      <span class="checkin-hold-countdown" data-hold-countdown>2.0</span>
      <span class="checkin-hold-pending"><span class="checkin-hold-spinner"></span>${tx('正在结束', 'Ending')}</span>
    </span>
  </button>`;
}

// The elapsed time decides completion; rendering the bar never controls a session.
export function createEndHold({ now, frame, cancelFrame, canContinue, onProgress, onComplete }) {
  let active = false, started = 0, pending = 0;
  const cancel = () => {
    active = false;
    cancelFrame(pending);
    pending = 0;
    onProgress(0, END_HOLD_MS);
  };
  const tick = () => {
    pending = 0;
    if (!active) return;
    if (!canContinue()) { cancel(); return; }
    const elapsed = Math.max(0, now() - started);
    onProgress(Math.min(1, elapsed / END_HOLD_MS), Math.max(0, END_HOLD_MS - elapsed));
    if (elapsed >= END_HOLD_MS) { active = false; onComplete(); }
    else pending = frame(tick);
  };
  return {
    start() {
      if (active || !canContinue()) return false;
      active = true;
      started = now();
      onProgress(0, END_HOLD_MS);
      pending = frame(tick);
      return true;
    },
    cancel,
    get active() { return active; },
  };
}

const bindings = new WeakMap();
export function connectHoldEnd(viewport, app) {
  if (!viewport?.addEventListener || !app) return;
  const previous = bindings.get(viewport);
  if (previous) { previous.update(app); return; }
  const doc = viewport.ownerDocument, win = doc.defaultView;
  let currentApp = app, press = null, heldKey = null, swallowClick = false, clickReset = 0;
  const available = () => Boolean(press?.button.isConnected && !press.button.disabled && !doc.hidden
    && !currentApp.state.dialog && !currentApp.state.notificationSheetOpen
    && !currentApp.ui.checkin?.sessionTransitioning
    && press.root === viewport.querySelector('[data-checkin-page]')
    && press.root?.dataset.checkinPhase === 'paused');
  const paintProgress = (button, ratio) => {
    const fill = button.querySelector('[data-hold-fill]');
    // Grow a real capsule: scaling would distort the stop glyph and numerals.
    fill.style.width = `calc(48px + (100% - 56px) * ${ratio})`;
    button.querySelector('.checkin-hold-copy').style.opacity = String(Math.max(0, 1 - ratio / .32));
  };
  const resetVisual = button => {
    if (!button) return;
    delete button.dataset.holding;
    button.dataset.holdPhase = 'idle';
    button.removeAttribute('aria-busy');
    paintProgress(button, 0);
    button.querySelector('[data-hold-label]').textContent = tx('长按结束', 'Hold to end');
    button.querySelector('[data-hold-countdown]').textContent = '2.0';
  };
  const hold = createEndHold({
    now: () => win.performance.now(),
    frame: callback => win.requestAnimationFrame(callback),
    cancelFrame: id => win.cancelAnimationFrame(id),
    canContinue: available,
    onProgress: (ratio, remaining) => {
      if (!press) return;
      paintProgress(press.button, ratio);
      press.button.querySelector('[data-hold-countdown]').textContent = (remaining / 1000).toFixed(1);
    },
    onComplete: () => {
      if (!available()) return;
      press.completed = true;
      press.button.dataset.holdPhase = 'pending';
      press.button.setAttribute('aria-busy', 'true');
      currentApp.actions['checkin.requestFinish']?.(currentApp, press.button, { type: 'checkin-hold-complete' });
    },
  });
  const stop = () => {
    const old = press;
    press = null;
    hold.cancel();
    // Releasing after commitment must not rewind a request already in flight.
    if (!old?.completed) resetVisual(old?.button);
    if (old?.pointer !== undefined && old.button.hasPointerCapture?.(old.pointer)) old.button.releasePointerCapture(old.pointer);
  };
  const clearClickAfterRelease = () => {
    win.clearTimeout(clickReset);
    clickReset = win.setTimeout(() => { swallowClick = false; }, 0);
  };
  const begin = (button, input) => {
    if (press || button.disabled || button.dataset.holdPhase === 'pending') return;
    win.clearTimeout(clickReset);
    swallowClick = true;
    heldKey = input.key || null;
    press = { button, root: button.closest('[data-checkin-page]'), ...input };
    if (!available()) { stop(); clearClickAfterRelease(); return; }
    button.dataset.holding = 'true';
    button.dataset.holdPhase = 'holding';
    button.querySelector('[data-hold-label]').textContent = tx('继续按住', 'Keep holding');
    hold.start();
  };
  viewport.addEventListener('pointerdown', event => {
    const button = event.target.closest('[data-hold-end]');
    if (!button || event.button !== 0 || !event.isPrimary) return;
    begin(button, { pointer: event.pointerId });
    if (press) button.setPointerCapture?.(event.pointerId);
  });
  doc.addEventListener('pointermove', event => {
    if (!press || press.pointer !== event.pointerId || press.completed) return;
    const r = press.button.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) stop();
  });
  const releasePointer = event => {
    if (press?.pointer === event.pointerId) stop();
    if (swallowClick) clearClickAfterRelease();
  };
  doc.addEventListener('pointerup', releasePointer);
  doc.addEventListener('pointercancel', releasePointer);
  viewport.addEventListener('lostpointercapture', event => {
    if (press?.pointer === event.pointerId && !press.completed) stop();
  });
  viewport.addEventListener('keydown', event => {
    if (event.key === 'Escape') { stop(); clearClickAfterRelease(); return; }
    const button = event.target.closest('[data-hold-end]');
    if (!button || ![' ', 'Enter'].includes(event.key)) return;
    event.preventDefault();
    if (!event.repeat) begin(button, { key: event.key });
  });
  doc.addEventListener('keyup', event => {
    if (heldKey === event.key) { event.preventDefault(); heldKey = null; stop(); clearClickAfterRelease(); }
  });
  viewport.addEventListener('focusout', event => { if (press?.button === event.target) stop(); });
  viewport.addEventListener('contextmenu', event => { if (event.target.closest('[data-hold-end]')) event.preventDefault(); });
  viewport.addEventListener('click', event => {
    const button = event.target.closest('[data-hold-end]');
    // Assistive activation (without a physical key/pointer sequence) keeps the
    // existing confirmation dialog. A short physical press never ends exercise.
    if (swallowClick || button && event.detail > 0) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  const interrupt = () => { stop(); heldKey = null; swallowClick = false; win.clearTimeout(clickReset); };
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) interrupt(); });
  win.addEventListener('blur', interrupt);
  win.addEventListener('pagehide', interrupt);
  bindings.set(viewport, { update(nextApp) {
    currentApp = nextApp;
    if (press && (!press.button.isConnected || (!press.completed && !available()))) stop();
  } });
}
