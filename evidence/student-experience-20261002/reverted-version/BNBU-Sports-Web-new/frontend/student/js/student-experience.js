// Presentation continuity for the student shell. Business actions never wait for motion.
const controllers = new WeakMap();
const ease = 'cubic-bezier(.2,.75,.2,1)';
const ignore = el => el.closest('[data-checkin-page], .checkin-sheet-overlay, .checkin-camera-overlay');
export const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true || globalThis.document?.documentElement?.dataset.previewReducedMotion === 'true';

export function studentScrollKey(app) {
  const tab = app.state.tab;
  if (tab === 'grades') return app.ui.grades?.section === 'records' ? `tab-grades-records-${app.ui.checkin?.selectedRecordId || 'list'}` : 'tab-grades-progress';
  if (tab === 'courses') return `tab-courses-${app.ui.courses?.selectedCourseId || 'overview'}`;
  return `tab-${tab}`;
}

function stateFor(app) {
  let state = controllers.get(app);
  const owner = `${app.state.workspace?.student?.id || ''}:${app.state.workspace?.selectedEnrollmentId || ''}`;
  if (!state || state.owner !== owner) {
    state?.motions.forEach(a => a.cancel());
    state = { owner, disclosures: new Map(), numbers: new Map(), motions: new Set() };
    controllers.set(app, state);
  }
  return state;
}
function animate(app, element, frames, duration = 220) {
  if (!element?.animate || reducedMotion() || document.hidden) return;
  const state = stateFor(app);
  let animation;
  try {animation = element.animate(frames, {duration, easing: ease});} catch {return;}
  state.motions.add(animation);
  animation.finished.catch(() => {}).finally(() => state.motions.delete(animation));
  return animation;
}
function fieldKey(el) {
  return el.id ? `#${el.id}` : el.dataset.input ? `${el.dataset.input}:${el.dataset.field || ''}` : null;
}
function scope(root) {
  return [...root.querySelectorAll('[data-scroll-key]')].map(el => el.dataset.scrollKey).join('|');
}
const disclosureKey = el => `${el.closest('[data-scroll-key]')?.dataset.scrollKey || 'shell'}:${el.dataset.disclosure}`;
const mainPage = root => [...root.querySelectorAll('.tab-host[data-scroll-key],.sub-screen-overlay [data-scroll-key]')].map(el=>el.dataset.scrollKey).join('|');
export function captureStudentExperience(app, root = app._viewport) {
  if (!root) return null;
  const state = stateFor(app), page = scope(root), active = document.activeElement;
  for (const el of root.querySelectorAll('details[data-disclosure]')) state.disclosures.set(disclosureKey(el), el._targetOpen ?? el.open);
  const rects = new Map([...root.querySelectorAll('[data-student-motion]')].map(el => [el.dataset.studentMotion, el.getBoundingClientRect()]));
  const field = root.contains(active) && !ignore(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)
    ? {key: fieldKey(active), start: active.selectionStart, end: active.selectionEnd} : null;
  const nav = root.querySelector('.nav-indicator');
  return {owner: state.owner, page, mainPage:mainPage(root), noticePage:root.querySelector('.sheet [data-scroll-key]')?.dataset.scrollKey, rects, field, nav: nav?.getBoundingClientRect(),
    scroll: new Map([...root.querySelectorAll('[data-scroll-key]')].map(el => [el.dataset.scrollKey, [el.scrollTop, el.scrollLeft]]))};
}

export function restoreStudentExperience(app, previous, root = app._viewport) {
  if (!root) return;
  const state = stateFor(app), page = scope(root), sameOwner = previous?.owner === state.owner;
  // Detached animations are decorative and can be cancelled on every render.
  state.motions.forEach(a => { if (!a.effect?.target?.isConnected) a.cancel(); });
  for (const el of root.querySelectorAll('details[data-disclosure]')) {
    const open = state.disclosures.get(disclosureKey(el));
    if (open !== undefined) el.open = open;
    const summary = el.querySelector('summary');
    summary?.addEventListener('click', event => {
      if (reducedMotion() || !el.animate) return;
      event.preventDefault();
      const closing = el._targetOpen ?? el.open, from = el.getBoundingClientRect().height;
      el._targetOpen = !closing;
      el.getAnimations?.().forEach(a => a.cancel());
      el.open = !closing;
      const to = el.getBoundingClientRect().height;
      el.open = true;
      el.style.overflow = 'hidden';
      const motion = animate(app, el, [{height: `${from}px`}, {height: `${to}px`}], 280);
      if (!motion) {el.open = !closing; el.style.overflow = ''; return;}
      // A generation token prevents a cancelled close from closing a reopened panel.
      el._disclosureMotion = motion;
      motion.finished.then(() => {if (el._disclosureMotion === motion) el.open = !closing;}).catch(() => {}).finally(() => {
        if (el._disclosureMotion === motion) {el.style.overflow = ''; state.disclosures.set(disclosureKey(el), el.open);}
      });
    });
  }
  if (sameOwner) for (const el of root.querySelectorAll('[data-scroll-key]')) {
    const pos = previous.scroll.get(el.dataset.scrollKey);
    if (pos) {el.scrollTop = pos[0]; el.scrollLeft = pos[1];}
  }
  if (sameOwner && previous.field?.key && page === previous.page) {
    const field = [...root.querySelectorAll('input,textarea,select')].find(el => fieldKey(el) === previous.field.key);
    if (field && !field.disabled) {
      field.focus({preventScroll: true});
      if (typeof previous.field.start === 'number') try {field.setSelectionRange(previous.field.start, previous.field.end);} catch {}
    }
  }
  if (sameOwner) {
    const indicator = root.querySelector('.nav-indicator'), to = indicator?.getBoundingClientRect();
    if (to && previous.nav && Math.abs(to.left - previous.nav.left) > 1)
      animate(app, indicator, [{translate: `${previous.nav.left - to.left}px 0`}, {translate: '0 0'}], 280);
    for (const el of root.querySelectorAll('[data-student-motion]')) {
      const from = previous.rects.get(el.dataset.studentMotion), to = el.getBoundingClientRect();
      if (from && to.width && from.width) {
        const dy = from.top - to.top, dx = from.left - to.left;
        if (Math.abs(dx) + Math.abs(dy) > 2 && Math.abs(dy) < 600)
          animate(app, el, [{translate: `${dx}px ${dy}px`}, {translate: '0 0'}], 280);
      } else if (page === previous.page) animate(app, el, [{opacity: 0, translate: '0 6px'}, {opacity: 1, translate: '0 0'}]);
    }
    if (mainPage(root) !== previous.mainPage) {
      const panel = root.querySelector('.sub-screen-overlay [data-scroll-key]') || root.querySelector('.tab-host > .tab-content');
      if (panel && !panel.matches('[data-checkin-page]')) animate(app, panel, [{opacity: .25}, {opacity: 1}]);
    }
    const notice = root.querySelector('.sheet [data-scroll-key]');
    if (previous.noticePage && notice && previous.noticePage !== notice.dataset.scrollKey) animate(app, notice, [{opacity:.3},{opacity:1}]);
    if (!previous.noticePage && notice) root.querySelector('[data-action="notifications.close"]')?.focus({preventScroll:true});
    if (previous.noticePage && !notice && !app.state.subScreen) root.querySelector('[data-action="dashboard.openNotifications"]')?.focus({preventScroll:true});
  }
  // First readings are shown directly; subsequent changes animate from the last real reading.
  for (const el of root.querySelectorAll('[data-student-number], [data-student-progress]')) {
    const key = el.dataset.studentNumber || el.dataset.studentProgress;
    const value = el.dataset.value, old = state.numbers.get(key);
    if (old !== undefined && value !== old && value !== '' && old !== '') {
      if (el.dataset.studentProgress) animate(app, el, [{transform: `scaleX(${old})`}, {transform: `scaleX(${value})`}], 320);
      else animate(app, el, [{opacity: .4, translate: '0 4px'}, {opacity: 1, translate: '0 0'}]);
    }
    state.numbers.set(key, value);
  }
  for (const button of root.querySelectorAll('button.pressable,a.pressable')) if (!ignore(button)) button.dataset.studentPressControl = 'true';
  attachInteractions(app, root);
}

function attachInteractions(app, root) {
  if (root.dataset.studentInteractions) return;
  root.dataset.studentInteractions = 'true';
  let pressed, pressMotion;
  const release = () => {
    pressMotion?.cancel();
    if (pressed?.isConnected) {pressed.style.scale = ''; animate(app, pressed, [{scale: '.97'}, {scale: '1.012', offset: .65}, {scale: '1'}], 180);}
    pressed = null;
  };
  root.addEventListener('pointerdown', event => {
    const button = event.target.closest('button:not(:disabled),a.pressable');
    if (!button || ignore(button) || reducedMotion() || event.button !== 0) return;
    pressed = button;
    pressMotion = animate(app, button, [{scale: '1'}, {scale: '.97'}], 120);
    button.style.scale = '.97';
  });
  root.addEventListener('pointerup', release);
  root.addEventListener('pointercancel', release);
  root.addEventListener('pointerout', event => {if (pressed && !pressed.contains(event.relatedTarget)) release();});
  // Only the handle captures dragging; scrolling notification content remains native.
  let drag, dragged = false;
  root.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-notification-handle]');
    if (!handle || event.button !== 0) return;
    dragged = false;
    drag = {y: event.clientY, sheet: handle.closest('.sheet'), handle};
    handle.setPointerCapture(event.pointerId);
  });
  root.addEventListener('pointermove', event => {
    if (!drag) return;
    drag.distance = Math.max(0, event.clientY - drag.y);
    if (!reducedMotion()) drag.sheet.style.translate = `0 ${drag.distance}px`;
  });
  const endDrag = event => {
    if (!drag) return;
    const current = drag; drag = null; current.sheet.style.translate = '';
    dragged = (current.distance || 0) > 8;
    if (event.type !== 'pointercancel' && current.distance > 90) app.actions['notifications.close'](app);
    else animate(app, current.sheet, [{translate: `0 ${current.distance || 0}px`}, {translate: '0 0'}], 280);
  };
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);
  root.addEventListener('click', event => {
    if (dragged && event.target.closest('[data-notification-handle]')) {event.preventDefault(); event.stopImmediatePropagation(); dragged = false;}
  }, true);
  root.addEventListener('keydown', event => {
    const modal = root.querySelector('[aria-modal="true"]');
    if (!modal || event.key !== 'Tab') return;
    const controls = [...modal.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled)')].filter(el => el.getClientRects().length);
    if (!controls.length) return;
    if (event.shiftKey && (document.activeElement === controls[0] || !modal.contains(document.activeElement))) {event.preventDefault(); controls.at(-1).focus();}
    else if (!event.shiftKey && (document.activeElement === controls.at(-1) || !modal.contains(document.activeElement))) {event.preventDefault(); controls[0].focus();}
  });
  document.addEventListener('visibilitychange', () => {if (document.hidden) {release(); stateFor(app).motions.forEach(a => a.cancel());}});
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener('change', event => {if (event.matches) stateFor(app).motions.forEach(a => a.cancel());});
}

export function progressMarkup(key, value, target) {
  const known = Number.isFinite(value) && Number.isFinite(target) && target > 0;
  const ratio = known ? Math.min(1, Math.max(0, value / target)) : null;
  return `<div class="student-meter${known ? '' : ' is-unknown'}" role="progressbar" aria-label="${key === 'semester' ? '学期进度 / Semester progress' : '运动进度 / Exercise progress'}" aria-valuemin="0" aria-valuemax="100" ${known ? `aria-valuenow="${Math.round(ratio * 100)}"` : ''}><span data-student-progress="${key}" data-value="${ratio ?? ''}" style="transform:scaleX(${ratio ?? 0})"></span></div>`;
}
