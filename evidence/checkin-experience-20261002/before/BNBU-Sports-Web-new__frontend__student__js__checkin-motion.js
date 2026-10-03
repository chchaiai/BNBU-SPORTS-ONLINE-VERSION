import {animate, spring} from '../vendor/animejs-4.5.0/anime.esm.min.js';
import {motionKey, sameCheckinSession} from './checkin-layout.js';
import {createMotionLoader, controlGlyphPaths} from './checkin-motion-loader.js';

const loadConfetti = createMotionLoader(() => import('../vendor/canvas-confetti-1.9.4/confetti.module.js'));
const contexts = new WeakMap();
const owners = new WeakMap();
const effects = new Set();
const targets = new WeakMap();
const preference = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
const movable = '[data-checkin-motion], .proof-card[data-draft-id], [data-checkin-record]';
const pressable = '.checkin-root button:not(:disabled)';

export function canAnimate(root) {
  const preview = root?.ownerDocument.documentElement.dataset.previewReducedMotion;
  return Boolean(root?.isConnected && !root.ownerDocument.hidden &&
    (preview === 'false' || (preview !== 'true' && !preference?.matches)));
}

function play(el, params, ctx, cleanup) {
  if (!el) return null;
  targets.get(el)?.cancel();
  if (!canAnimate(ctx?.root || el.closest('[data-checkin-page]'))) { cleanup?.(); return null; }
  let entry;
  const finish = () => {
    if (!entry || !effects.has(entry)) return;
    effects.delete(entry);
    if (targets.get(el) === entry) targets.delete(el);
    entry.animation.revert();
    cleanup?.();
  };
  const animation = animate(el, {duration: 240, ease: 'outCubic', ...params, onComplete: finish});
  entry = {el, ctx, animation, cancel: finish};
  effects.add(entry); targets.set(el, entry);
  return entry;
}

function stop(ctx) {
  for (const effect of [...effects]) if (effect.ctx === ctx) effect.cancel();
}

function settle(ctx) {
  const pressed = ctx.pressed;
  ctx.pressed = null;
  stop(ctx);
  pressed?.style.removeProperty('transform');
  ctx.celebration?.();
}

function context(viewport) {
  let ctx = contexts.get(viewport);
  if (ctx) return ctx;
  ctx = {viewport, root: null, pressed: null, celebration: null};
  contexts.set(viewport, ctx);
  viewport.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const button = event.target.closest(pressable);
    if (!button || !canAnimate(ctx.root)) return;
    ctx.pressed = button;
    play(button, {scale: .97, duration: 120, ease: 'outQuad'}, ctx, () => {
      if (ctx.pressed === button && canAnimate(ctx.root)) button.style.transform = 'scale(.97)';
    });
  });
  const release = event => {
    const button = ctx.pressed; ctx.pressed = null;
    if (!button?.isConnected) return;
    play(button, {scale: [.97, 1], ease: spring({duration: event.type === 'pointercancel' ? 120 : 180, bounce: .18})}, ctx, () => button.style.removeProperty('transform'));
  };
  viewport.ownerDocument.addEventListener('pointerup', release);
  viewport.ownerDocument.addEventListener('pointercancel', release);
  viewport.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key) || event.repeat) return;
    const button = event.target.closest(pressable);
    if (button) {ctx.pressed = button; play(button, {scale: .97, duration: 120}, ctx, () => {
      if (ctx.pressed === button && canAnimate(ctx.root)) button.style.transform = 'scale(.97)';
    });}
  });
  viewport.addEventListener('keyup', release);
  viewport.addEventListener('checkin-clear-error', event => {
    const error = event.target.closest('[data-checkin-error]');
    if (error) play(error, {height: [error.getBoundingClientRect().height, 0], opacity: [1, 0], duration: 220}, ctx, () => error.remove());
  });
  viewport.addEventListener('click', event => {
    const summary = event.target.closest('.checkin-disclosure > summary');
    if (!summary || !canAnimate(ctx.root)) return;
    event.preventDefault();
    const details = summary.parentElement;
    const height = details.getBoundingClientRect().height;
    targets.get(details)?.cancel();
    details.open = !details.open;
    const next = details.getBoundingClientRect().height;
    details.style.overflow = 'clip';
    play(details, {height: [height, next], duration: 280}, ctx, () => details.style.removeProperty('overflow'));
  });
  viewport.ownerDocument.addEventListener('visibilitychange', () => {
    if (viewport.ownerDocument.hidden) settle(ctx);
  });
  viewport.ownerDocument.defaultView?.addEventListener('pagehide', () => settle(ctx));
  viewport.ownerDocument.defaultView?.addEventListener('blur', () => settle(ctx));
  preference?.addEventListener('change', () => { if (!canAnimate(ctx.root)) settle(ctx); });
  return ctx;
}

function flip(el, old, ctx, duration = 280, scale = false) {
  const next = el.getBoundingClientRect(), bounds = ctx.viewport.getBoundingClientRect();
  if (!old?.rect.width || !old.rect.height || !next.width || !next.height ||
      old.rect.bottom < bounds.top || old.rect.top > bounds.bottom) return;
  const x = old.rect.left - next.left, y = old.rect.top - next.top;
  if (Math.abs(x) < .5 && Math.abs(y) < .5 && (!scale || Math.abs(old.rect.width - next.width) < .5)) return;
  el.style.transformOrigin = 'top left';
  play(el, {translateX: [x, 0], translateY: [y, 0],
    ...(scale ? {scaleX: [old.rect.width / next.width, 1], scaleY: [old.rect.height / next.height, 1]} : {}),
    duration}, ctx, () => el.style.removeProperty('transform-origin'));
}

function enter(el, ctx, duration = 240, delay = 0) {
  play(el, {opacity: [0, 1], translateY: [6, 0], duration, delay}, ctx);
}

function removeProof(old, ctx) {
  const bounds = ctx.viewport.getBoundingClientRect(), rect = old.rect;
  if (!old.html || rect.bottom < bounds.top || rect.top > bounds.bottom || rect.right < bounds.left || rect.left > bounds.right) return;
  const ghost = old.node.cloneNode(true);
  ghost.removeAttribute('data-action'); ghost.removeAttribute('data-draft-id');
  ghost.setAttribute('aria-hidden', 'true'); ghost.setAttribute('tabindex', '-1'); ghost.inert = true;
  Object.assign(ghost.style, {position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`,
    width: `${rect.width}px`, height: `${rect.height}px`, margin: '0', pointerEvents: 'none', zIndex: '20'});
  ctx.root.append(ghost);
  play(ghost, {opacity: [1, 0], scale: [1, .94], duration: 180}, ctx, () => ghost.remove());
}

export function updateNumber(el, value, previous) {
  const next = String(value), old = previous ?? el.dataset.motionValue ?? el.textContent;
  if (old === next) return;
  targets.get(el)?.cancel();
  const root = el.closest('[data-checkin-page]'), ctx = owners.get(root);
  el.dataset.motionValue = next;
  el.textContent = next;
  // Unknown values and an initial render are never animated from an invented zero.
  if (!ctx || !canAnimate(root) || !/\d/.test(old) || !/\d/.test(next)) return;
  const doc = el.ownerDocument, fragment = doc.createDocumentFragment();
  const label = doc.createElement('span'); label.className = 'checkin-motion-sr'; label.textContent = next;
  fragment.append(label);
  const visual = doc.createElement('span'); visual.setAttribute('aria-hidden', 'true'); visual.className = 'checkin-number-visual';
  const oldDigits = (old.match(/\d/g) || []).reverse();
  let digitIndex = (next.match(/\d/g) || []).length;
  for (const char of next) {
    if (!/\d/.test(char)) {visual.append(doc.createTextNode(char)); continue;}
    const before = oldDigits[--digitIndex];
    const cell = doc.createElement('span'); cell.className = 'checkin-number-cell';
    const fresh = doc.createElement('span'); fresh.textContent = char; cell.append(fresh);
    if (before && before !== char) {
      const departing = doc.createElement('span'); departing.textContent = before; departing.className = 'checkin-number-old'; cell.append(departing);
      play(fresh, {translateY: ['90%', '0%'], opacity: [0, 1], duration: 220}, ctx);
      play(departing, {translateY: ['0%', '-90%'], opacity: [1, 0], duration: 220}, ctx);
    }
    visual.append(cell);
  }
  fragment.append(visual); el.replaceChildren(fragment);
  // One lifecycle entry also guarantees cleanup on backgrounding or a rerender.
  play(el, {opacity: [1, 1], duration: 230}, ctx, () => {
    if (el.dataset.motionValue === next) el.textContent = next;
  });
}

function animateGlyph(ctx, previous) {
  const root = ctx.root, phase = root.dataset.checkinPhase;
  const glyph = root.querySelector('[data-checkin-glyph] > svg');
  if (!glyph) return;
  const changedSport = previous.sport !== root.querySelector('[data-checkin-sport-key]')?.dataset.checkinSportKey;
  if (changedSport && phase === 'idle') play(glyph, {scale: [.85, 1], rotate: [-5, 0], ease: spring({duration: 260, bounce: .2})}, ctx);
  else if (previous.phase !== phase && phase === 'active') {
    play(glyph, {translateY: [0, -3, 0, -2, 0], rotate: [0, -4, 0, 3, 0], duration: 600}, ctx);
  } else if (previous.phase !== phase && phase === 'paused') {
    play(glyph, {scale: [1.05, 1], duration: 220}, ctx);
  } else if (previous.phase !== phase && phase === 'finished') {
    play(glyph, {translateY: [0, -5, 0], scale: [1, 1.08, 1], duration: 380}, ctx);
  }
}

function animateSelection(ctx, previous) {
  for (const button of ctx.root.querySelectorAll('.category-btn.selected, .sport-btn.selected')) {
    const old = previous.selections?.get(button.dataset.action);
    if (!old || old.value === button.dataset.value || !old.rect.width) continue;
    const rect = button.getBoundingClientRect();
    if (!rect.width) continue;
    const surface = button.ownerDocument.createElement('span');
    surface.className = 'checkin-selection-surface'; surface.setAttribute('aria-hidden', 'true');
    surface.style.backgroundColor = getComputedStyle(button).backgroundColor;
    button.style.backgroundColor = 'transparent'; button.append(surface);
    play(surface, {translateX: [old.rect.left - rect.left, 0], translateY: [old.rect.top - rect.top, 0],
      scaleX: [old.rect.width / rect.width, 1], scaleY: [old.rect.height / rect.height, 1], duration: 220}, ctx,
    () => {surface.remove(); button.style.removeProperty('background-color');});
  }
}

export function connect(viewport, root, previous, success) {
  const ctx = context(viewport);
  const wasSuccess = ctx.root?.dataset.checkinPage === 'submitted' && ctx.root?.dataset.checkinOwner === root.dataset.checkinOwner;
  stop(ctx);
  if (!wasSuccess || root.dataset.checkinPage !== 'submitted') ctx.celebration?.();
  ctx.root = root; owners.set(root, ctx); root.dataset.motionReady = 'true';
  if (root.dataset.checkinPage === 'finished' && canAnimate(root)) void loadConfetti();
  if (!canAnimate(root)) {settle(ctx); return;}
  if (sameCheckinSession(previous, root)) {
    const samePage = previous.page === root.dataset.checkinPage;
    const phaseChanged = previous.phase !== root.dataset.checkinPhase;
    const nodes = [...root.querySelectorAll(movable)];
    for (const el of nodes) {
      const key = motionKey(el), old = previous.rects.get(key);
      if (el.matches('[data-checkin-error]') && !old) {enter(el, ctx); continue;}
      if (key === 'sport' && old?.text !== el.textContent) {enter(el, ctx); continue;}
      if (el.matches('.proof-card') && !previous.proofs.has(el.dataset.draftId)) {
        enter(el, ctx); play(el.querySelector('.proof-card-media'), {scale: [.96, 1], duration: 240}, ctx); continue;
      }
      if (el.matches('[data-checkin-record]') && !old) {enter(el, ctx); continue;}
      // Moving a parent already moves its descendants. Shared timer/name are
      // animated separately only when the stage changes.
      if (!samePage && el.closest('[data-checkin-enter]')) continue;
      if (samePage && ['timer', 'sport'].includes(key) && !phaseChanged) continue;
      if (key === 'control-primary' && old && phaseChanged) {
        const next = el.getBoundingClientRect();
        play(el, {width: [old.rect.width, next.width], duration: 280}, ctx);
      } else flip(el, old, ctx, samePage ? 280 : 320, ['timer', 'sport'].includes(key));
    }
    if (!samePage) {
      [...root.querySelectorAll('[data-checkin-enter]')].forEach((el, index) => enter(el, ctx, 320, Math.min(index, 2) * 40));
    } else {
      for (const [key, old] of previous.rects) if (key.startsWith('proof:') && !nodes.some(el => motionKey(el) === key)) removeProof(old, ctx);
      if (phaseChanged) {
        const before = controlGlyphPaths(previous.phase === 'paused');
        const after = controlGlyphPaths(root.dataset.checkinPhase === 'paused');
        [...root.querySelectorAll('[data-checkin-control-icon] path')].forEach((path, i) => play(path, {d: [before[i], after[i]], duration: 220}, ctx));
        if (root.dataset.checkinPhase === 'paused') enter(root.querySelector('[data-checkin-motion="control-end"]'), ctx, 190, 90);
      }
    }
    for (const el of root.querySelectorAll('[data-checkin-number]')) {
      const old = previous.numbers?.get(el.dataset.checkinNumber);
      if (old != null) updateNumber(el, el.textContent, old);
    }
    if (samePage && [...root.querySelectorAll('.proof-card[data-draft-id]')].some(el => !previous.proofs.has(el.dataset.draftId) && el.dataset.proofType === 'image')) {
      const camera = root.querySelector('[data-action="checkin.capturePhoto"] > svg');
      play(camera, {scale: [1, .75, 1], rotate: [0, -8, 0], duration: 300}, ctx);
    }
    animateGlyph(ctx, previous);
    if (samePage && root.dataset.checkinPage === 'preparation') animateSelection(ctx, previous);
  }
  if (success) void celebrate(viewport, root).catch(() => ctx.celebration?.());
}

export function disconnect(viewport) {
  const ctx = contexts.get(viewport);
  if (ctx) {settle(ctx); ctx.root = null;}
}

export async function celebrate(viewport, root) {
  const ctx = context(viewport);
  ctx.celebration?.();
  if (!canAnimate(root)) return;
  const token = {};
  ctx.celebrationToken = token;
  const circle = root.querySelector('.submit-success-circle');
  const path = root.querySelector('[data-success-check]');
  play(circle, {scale: [.8, 1], ease: spring({duration: 360, bounce: .25})}, ctx);
  if (path) play(path, {strokeDashoffset: [24, 0], duration: 280}, ctx);
  let canvas, cannon, timer;
  ctx.celebration = () => {
    if (ctx.celebrationToken !== token) return;
    clearTimeout(timer); cannon?.reset(); canvas?.remove(); ctx.celebrationToken = null; ctx.celebration = null;
  };
  const module = await loadConfetti();
  if (ctx.celebrationToken !== token) return;
  if (!module || !canAnimate(ctx.root)) {ctx.celebration?.(); return;}
  const bounds = viewport.getBoundingClientRect();
  canvas = root.ownerDocument.createElement('canvas');
  canvas.className = 'checkin-celebration'; canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px`});
  root.ownerDocument.body.append(canvas);
  const respectSystem = root.ownerDocument.documentElement.dataset.previewReducedMotion !== 'false';
  try { cannon = module.default.create(canvas, {resize: true, disableForReducedMotion: respectSystem}); }
  catch { ctx.celebration?.(); return; }
  timer = setTimeout(() => {
    if (ctx.celebrationToken !== token || !canAnimate(ctx.root)) return;
    const options = {particleCount: 38, spread: 62, startVelocity: 24, gravity: 1.05, ticks: 75,
      scalar: .8, colors: ['#007aff', '#50c8e8', '#ffd166', '#a6e3cd'], shapes: ['square', 'circle', 'star'], disableForReducedMotion: respectSystem};
    try {
      cannon({...options, angle: 60, origin: {x: .12, y: .42}});
      cannon({...options, angle: 120, origin: {x: .88, y: .42}});
    } catch { ctx.celebration?.(); return; }
    timer = setTimeout(() => ctx.celebration?.(), 1500);
  }, 280);
}
