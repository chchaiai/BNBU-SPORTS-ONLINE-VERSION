import { tx } from './i18n.js';
import { icon } from './icons.js';

const PAD = 4;
const GRIP = 48;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// SlideCommit's direct manipulation, adapted to the student's existing state/API.
export function slideEndHtml(disabled = false, pending = false, confirming = false) {
  return `<div class="checkin-end-btn checkin-slide-end" role="slider" tabindex="${disabled ? -1 : 0}" data-action="checkin.requestFinish" data-slide-end data-slide-phase="${pending ? 'pending' : confirming ? 'confirming' : 'idle'}" aria-label="${tx('向右滑动结束运动', 'Slide right to end exercise')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pending || confirming ? 100 : 0}" aria-disabled="${disabled}" aria-describedby="checkin-end-hint checkin-slide-keyboard" ${pending ? 'aria-busy="true"' : ''}>
    <span class="checkin-slide-label" data-slide-label aria-hidden="true">${pending ? tx('正在结束', 'Ending') : confirming ? tx('等待确认', 'Awaiting confirmation') : tx('滑动结束', 'Slide to end')}</span>
    <span class="checkin-slide-trail" data-slide-trail aria-hidden="true"></span>
    <span class="checkin-slide-thumb" data-slide-thumb aria-hidden="true"><span class="checkin-slide-arrow">${icon('chevron-right', 24)}</span><span class="checkin-slide-check">${icon('check',24)}</span><span class="checkin-slide-spinner"></span></span>
    <span id="checkin-slide-keyboard" class="checkin-motion-sr">${tx('方向键移动，End 键确认，Esc 取消。', 'Use arrow keys to move, End to confirm, Escape to cancel.')}</span>
  </div>`;
}

export function rewindSlideEnd(viewport) {
  const track = viewport.querySelector('[data-slide-end][data-slide-phase="idle"]');
  if (!track) return;
  const thumb = track.querySelector('[data-slide-thumb]'), trail = track.querySelector('[data-slide-trail]');
  const label = track.querySelector('[data-slide-label]');
  // CSS owns the return so a new pointerdown can catch the moving thumb.
  for (const node of [thumb, trail, label]) node.style.transition = 'none';
  thumb.style.transform = `translateX(${Math.max(0,track.clientWidth-PAD*2-GRIP)}px)`;
  trail.style.width = `${track.clientWidth-PAD*2}px`; label.style.opacity = '0';
  thumb.getBoundingClientRect();
  for (const node of [thumb, trail, label]) node.style.removeProperty('transition');
  thumb.style.transform = 'translateX(0px)'; trail.style.width = `${GRIP}px`; label.style.opacity = '1';
}

export function slidePosition(clientX, trackLeft, scale, grabOffset, travel) {
  return clamp((clientX - trackLeft) / scale - PAD - grabOffset, 0, travel);
}

const bindings = new WeakMap();
export function connectSlideEnd(viewport, app) {
  if (!viewport?.addEventListener || !app) return;
  const previous = bindings.get(viewport);
  if (previous) { previous.update(app); return; }
  const doc = viewport.ownerDocument, win = doc.defaultView;
  let currentApp = app, drag = null, swallowClick = false, clickReset = 0;
  const available = entry => Boolean(entry?.track.isConnected && entry.track.getAttribute('aria-disabled') !== 'true' && !doc.hidden
    && !currentApp.state.dialog && !currentApp.state.notificationSheetOpen
    && !currentApp.ui.checkin?.sessionTransitioning
    && entry.root === viewport.querySelector('[data-checkin-page]') && entry.root?.dataset.checkinPhase === 'paused');
  const geometry = track => {
    const rect = track.getBoundingClientRect();
    const width = track.clientWidth;
    return {rect, scale: width > 0 ? rect.width / width : 1, travel: Math.max(0, width - PAD * 2 - GRIP)};
  };
  const paint = (entry, x) => {
    entry.x = x;
    const {track, travel} = entry, ratio = travel ? x / travel : 0;
    track.querySelector('[data-slide-thumb]').style.transform = `translateX(${x}px)`;
    track.querySelector('[data-slide-trail]').style.width = `${x + GRIP}px`;
    track.querySelector('[data-slide-label]').style.opacity = String(Math.max(0, 1 - ratio / .6));
    track.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
  };
  const releaseCapture = entry => {
    if (entry?.pointer !== undefined && entry.track.hasPointerCapture?.(entry.pointer)) entry.track.releasePointerCapture(entry.pointer);
  };
  const cancel = () => {
    const old = drag; drag = null;
    if (!old) return;
    old.track.dataset.slidePhase = 'idle';
    paint(old, 0);
    releaseCapture(old);
  };
  const resetClick = () => {
    win.clearTimeout(clickReset);
    clickReset = win.setTimeout(() => {swallowClick = false;}, 0);
  };
  const commit = () => {
    if (!available(drag)) {cancel(); return;}
    const old = drag; drag = null;
    old.track.dataset.slidePhase = 'pending';
    paint(old, old.travel);
    old.track.setAttribute('aria-busy', 'true');
    old.track.querySelector('[data-slide-label]').textContent = tx('正在结束', 'Ending');
    old.track.querySelector('[data-slide-label]').style.opacity = '1';
    releaseCapture(old);
    currentApp.actions['checkin.requestFinish']?.(currentApp, old.track, {type:'checkin-slide-complete'});
  };
  const entryFor = track => ({track, root:track.closest('[data-checkin-page]'), ...geometry(track), x:0});
  viewport.addEventListener('pointerdown', event => {
    const thumb = event.target.closest('[data-slide-thumb]');
    const track = thumb?.closest('[data-slide-end]');
    if (!track || drag || event.button !== 0 || !event.isPrimary || track.dataset.slidePhase === 'pending') return;
    const entry = entryFor(track);
    if (!available(entry) || !entry.travel) return;
    event.preventDefault(); win.clearTimeout(clickReset); swallowClick = true;
    const thumbRect = thumb.getBoundingClientRect();
    drag = {...entry, pointer:event.pointerId, grabOffset:(event.clientX-thumbRect.left)/entry.scale};
    const x = clamp((thumbRect.left-entry.rect.left)/entry.scale-PAD, 0, entry.travel);
    track.dataset.slidePhase = 'dragging';
    paint(drag, x); // Catch a returning thumb at its current visible position.
    track.focus({preventScroll:true});
    track.setPointerCapture?.(event.pointerId);
  });
  const move = event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    if (!available(drag)) {cancel(); return;}
    const {rect, scale, travel} = geometry(drag.track);
    // Horizontal overshoot is clamped; a deliberate vertical escape cancels.
    if (event.clientY < rect.top-36 || event.clientY > rect.bottom+36 || !travel) {cancel(); return;}
    drag.travel = travel;
    paint(drag, slidePosition(event.clientX, rect.left, scale, drag.grabOffset, travel));
  };
  doc.addEventListener('pointermove', move);
  doc.addEventListener('pointerup', event => {
    if (drag?.pointer === event.pointerId) {
      move(event);
      if (drag && drag.x >= drag.travel - .5) commit();
      else cancel();
    }
    if (swallowClick) resetClick();
  });
  doc.addEventListener('pointercancel', event => {if (drag?.pointer === event.pointerId) cancel(); resetClick();});
  viewport.addEventListener('lostpointercapture', event => {if (drag?.pointer === event.pointerId) cancel();});
  viewport.addEventListener('keydown', event => {
    const track = event.target.closest('[data-slide-end]');
    if (!track || !['ArrowRight','ArrowUp','ArrowLeft','ArrowDown','Home','End','Escape','Enter',' '].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Escape' || event.key === 'Home') {cancel(); resetClick(); return;}
    if (track.dataset.slidePhase === 'pending' || drag?.pointer !== undefined) return;
    const entry = drag || entryFor(track);
    if (!available(entry) || !entry.travel) return;
    swallowClick = true; win.clearTimeout(clickReset);
    if (event.key === 'Enter' || event.key === ' ') {
      cancel();
      if (!event.repeat) currentApp.actions['checkin.requestFinish']?.(currentApp, track, {type:'checkin-keyboard-confirm'});
      return;
    }
    drag = entry; track.dataset.slidePhase = 'dragging';
    if (event.key === 'End') {commit(); return;}
    const direction = ['ArrowRight','ArrowUp'].includes(event.key) ? 1 : -1;
    paint(drag, clamp(drag.x + direction * drag.travel / 10, 0, drag.travel));
    if (drag.x >= drag.travel - .5) commit();
  });
  doc.addEventListener('keyup', () => {if (swallowClick) resetClick();});
  viewport.addEventListener('focusout', event => {if (drag?.track === event.target) cancel();});
  viewport.addEventListener('contextmenu', event => {if (event.target.closest('[data-slide-end]')) event.preventDefault();});
  viewport.addEventListener('click', event => {
    const track = event.target.closest('[data-slide-end]');
    if (swallowClick || track && event.detail > 0) {event.preventDefault(); event.stopImmediatePropagation();}
  }, true);
  const interrupt = () => {cancel(); swallowClick = false; win.clearTimeout(clickReset);};
  doc.addEventListener('visibilitychange', () => {if (doc.hidden) interrupt();});
  win.addEventListener('blur', interrupt); win.addEventListener('pagehide', interrupt); win.addEventListener('resize', interrupt);
  bindings.set(viewport, {update(nextApp) {currentApp = nextApp; if (drag && !available(drag)) cancel();}});
}
