import test from 'node:test';
import assert from 'node:assert/strict';
import { createEndHold, connectHoldEnd, END_HOLD_MS } from './js/checkin-hold-end.js';
import { buildLocalPreviewWorkspace } from './js/local-preview.js';
import { saveSession, loadSession } from './js/session.js';
import { renderCheckIn, checkinActions } from './js/screens/checkin.js';

function scheduler() {
  let now = 0, sequence = 0;
  const callbacks = new Map();
  return { now: () => now, frame(fn) { callbacks.set(++sequence, fn); return sequence; }, cancelFrame: id => callbacks.delete(id),
    advance(ms) { now += ms; const batch = [...callbacks.values()]; callbacks.clear(); batch.forEach(fn => fn()); } };
}
test('hold tracks elapsed time, completes only at 2 seconds, and fires once', () => {
  const clock = scheduler(); let completions = 0, progress;
  const hold = createEndHold({ ...clock, canContinue: () => true, onProgress: value => { progress = value; }, onComplete: () => completions++ });
  hold.start(); clock.advance(1500); assert.equal(progress, .75); assert.equal(completions, 0);
  assert.equal(hold.start(), false); clock.advance(499); assert.equal(completions, 0);
  clock.advance(1); assert.equal(completions, 1); assert.equal(progress, 1);
  clock.advance(9000); assert.equal(completions, 1);
});
test('cancellation clears progress and a new hold starts from zero', () => {
  const clock = scheduler(); let completions = 0, progress;
  const hold = createEndHold({ ...clock, canContinue: () => true, onProgress: value => { progress = value; }, onComplete: () => completions++ });
  hold.start(); clock.advance(1500); hold.cancel(); assert.equal(progress, 0);
  clock.advance(6000); assert.equal(completions, 0); hold.start(); clock.advance(500); assert.equal(progress, .25);
});
test('a hidden page, changed session or unavailable button cancels before completion', () => {
  const clock = scheduler(); let allowed = true, completions = 0;
  const hold = createEndHold({ ...clock, canContinue: () => allowed, onProgress() {}, onComplete: () => completions++ });
  hold.start(); clock.advance(1000); allowed = false; clock.advance(1000);
  assert.equal(completions, 0); assert.equal(hold.active, false);
});

function eventHost() {
  const listeners = new Map();
  return { addEventListener(type, handler) { const rows = listeners.get(type) || []; rows.push(handler); listeners.set(type, rows); },
    emit(type, data = {}) { const event = { preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...data }; (listeners.get(type) || []).forEach(fn => fn(event)); return event; } };
}
function bindingFixture() {
  const clock = scheduler(); const win = { ...eventHost(), performance: { now: clock.now }, requestAnimationFrame: clock.frame, cancelAnimationFrame: clock.cancelFrame, setTimeout: clock.frame, clearTimeout: clock.cancelFrame };
  const doc = { ...eventHost(), defaultView: win, hidden: false };
  const root = { dataset: { checkinPhase: 'paused' } }, fill = { style: {} }, label = {}, countdown = {};
  const button = { dataset: {}, isConnected: true, disabled: false, closest: selector => selector === '[data-checkin-page]' ? root : button,
    querySelector: selector => selector === '[data-hold-fill]' ? fill : selector === '[data-hold-label]' ? label : countdown,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 140, bottom: 54 }), setPointerCapture() {}, hasPointerCapture: () => false };
  const viewport = { ...eventHost(), ownerDocument: doc, querySelector: () => root };
  let completions = 0;
  const app = { state: {}, ui: {}, actions: { 'checkin.requestFinish': () => completions++ } };
  connectHoldEnd(viewport, app);
  const pointer = { target: button, pointerId: 1, button: 0, isPrimary: true, clientX: 80, clientY: 20 };
  return { clock, viewport, doc, win, app, button, fill, label, pointer, completed: () => completions };
}
test('short taps cannot open the finish action; pointer holds show progress then complete', () => {
  const f = bindingFixture(); f.viewport.emit('pointerdown', f.pointer); f.clock.advance(650);
  assert.match(f.fill.style.transform, /0.325/);
  f.doc.emit('pointerup', f.pointer);
  assert.equal(f.viewport.emit('click', { target: f.button, detail: 1 }).stopped, true);
  f.clock.advance(2000); assert.equal(f.completed(), 0);
  f.viewport.emit('pointerdown', f.pointer); f.clock.advance(END_HOLD_MS); assert.equal(f.completed(), 1);
});
test('sliding out, pointer cancellation, page backgrounding and DOM replacement cancel the hold', () => {
  for (const cancel of [f => f.doc.emit('pointermove', { ...f.pointer, clientX: 141 }), f => f.doc.emit('pointercancel', f.pointer),
    f => { f.doc.hidden = true; f.doc.emit('visibilitychange'); }, f => { f.button.isConnected = false; connectHoldEnd(f.viewport, f.app); }]) {
    const f = bindingFixture(); f.viewport.emit('pointerdown', f.pointer); f.clock.advance(1000); cancel(f); f.clock.advance(2000);
    assert.equal(f.completed(), 0); assert.equal(f.fill.style.transform, 'scaleX(0)');
  }
});
test('keyboard holding works; moving focus and releasing a key cannot leave clicks blocked', () => {
  const f = bindingFixture(); f.viewport.emit('keydown', { target: f.button, key: ' ', repeat: false });
  f.clock.advance(700); f.viewport.emit('focusout', { target: f.button }); f.doc.emit('keyup', { key: ' ' }); f.clock.advance(0);
  assert.equal(f.viewport.emit('click', { target: f.button, detail: 0 }).stopped, undefined);
  f.viewport.emit('keydown', { target: f.button, key: 'Enter', repeat: false }); f.clock.advance(2000); assert.equal(f.completed(), 1);
});
test('assistive activation preserves the existing confirmation dialog path', () => {
  const f = bindingFixture(); const event = f.viewport.emit('click', { target: f.button, detail: 0 });
  assert.equal(event.stopped, undefined); assert.equal(f.completed(), 0);
});

function sessionFixture(t, minutes) {
  const memory = new Map();
  globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
  t.after(() => delete globalThis.localStorage);
  const workspace = buildLocalPreviewWorkspace(), owner = workspace.student.id;
  const app = { state: { workspace, tab: 'checkin' }, ui: {}, isApiMode: () => false, isLocalPreview: () => true, hasActiveEnrollment: () => true, isWriteAllowed: () => true,
    render() {}, showDialog(dialog) { this.state.dialog = dialog; } };
  saveSession(owner, { phase: 'paused', startedAt: Date.now() - minutes * 60000, accumulatedMs: minutes * 60000, maximumDurationSeconds: 7200, details: { creditType: 'general', sportType: 'running', description: '' } });
  renderCheckIn(app);
  return { app, owner };
}
test('a completed hold ends an eligible local session without a duplicate confirmation', t => {
  const { app, owner } = sessionFixture(t, 35);
  checkinActions['checkin.requestFinish'](app, null, { type: 'checkin-hold-complete' });
  assert.equal(loadSession(owner).phase, 'finished'); assert.equal(app.state.dialog, undefined);
});
test('a completed hold below the minimum keeps the original warning and leaves the session paused', t => {
  const { app, owner } = sessionFixture(t, 1);
  checkinActions['checkin.requestFinish'](app, null, { type: 'checkin-hold-complete' });
  assert.equal(loadSession(owner).phase, 'paused'); assert.match(app.state.dialog.body, /不会形成打卡记录/);
});
test('the fallback confirmation and disabled state remain available', t => {
  const { app, owner } = sessionFixture(t, 35);
  checkinActions['checkin.requestFinish'](app); assert.ok(app.state.dialog); assert.equal(loadSession(owner).phase, 'paused');
  app.ui.checkin.sessionTransitioning = true;
  assert.match(renderCheckIn(app), /data-hold-end[^>]*disabled/);
});
