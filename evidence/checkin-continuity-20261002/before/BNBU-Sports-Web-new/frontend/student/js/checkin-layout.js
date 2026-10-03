import {connectCheckinMotion} from './checkin-motion-loader.js';
import {connectSlideEnd, rewindSlideEnd} from './checkin-slide-end.js';

export function captureEndDialog(viewport) {
  const node = viewport.querySelector('[data-checkin-end-dialog]');
  if (!node) return null;
  const panel = node.querySelector('.dialog'), win = node.ownerDocument.defaultView;
  const style = win.getComputedStyle(panel), transform = style.transform;
  const matrix = transform && transform !== 'none' ? new win.DOMMatrixReadOnly(transform) : null;
  return {node, key:node.dataset.checkinEndDialog, opacity:win.getComputedStyle(node).opacity,
    panelOpacity:style.opacity, y:matrix?.m42 || 0, scale:matrix?.m11 || 1,
    slideComplete:Boolean(viewport.querySelector('[data-slide-phase="confirming"]')),
    focusedAction:node.contains(node.ownerDocument.activeElement) ? node.ownerDocument.activeElement.dataset.action : null};
}

export function restoreEndDialogAccess(viewport, root, previous) {
  const dialog = viewport.querySelector('[data-checkin-end-dialog]');
  if (dialog) {
    if (root) root.inert = true;
    const buttons = [...dialog.querySelectorAll('button[data-action]')];
    (buttons.find(el => el.dataset.action === previous?.endDialog?.focusedAction) || buttons[0])?.focus({preventScroll:true});
  } else if (previous?.endDialog && root && sameCheckinSession(previous, root) && previous.page === root.dataset.checkinPage && !viewport.querySelector('.dialog-scrim')) {
    if (previous.endDialog.slideComplete) rewindSlideEnd(viewport);
    root.querySelector('[data-slide-end]')?.focus({preventScroll:true});
  }
}

export function isFocusedCheckin(state, session) {
  return state.tab === 'checkin' && !state.subScreen &&
    ['active', 'paused', 'finished'].includes(session?.phase);
}

export function motionKey(el) {
  if (el.dataset.checkinMotion) return el.dataset.checkinMotion;
  if (el.matches('.proof-card[data-draft-id]')) return `proof:${el.dataset.draftId}`;
  if (el.dataset.checkinRecord) return `record:${el.dataset.checkinRecord}`;
  return null;
}

export function captureCheckinLayout(viewport) {
  const root = viewport?.querySelector('[data-checkin-page]');
  if (!root) return null;
  const rects = new Map([...root.querySelectorAll('[data-checkin-motion], .proof-card[data-draft-id], [data-checkin-record]')].map(el =>
    [motionKey(el), {rect: el.getBoundingClientRect(), text: el.dataset.motionValue || el.textContent,
      node: el, html: el.matches('.proof-card, [data-checkin-record]') ? el.outerHTML : null,
      opacity: el.ownerDocument.defaultView.getComputedStyle(el).opacity}]));
  const focused = root.ownerDocument.activeElement;
  const field = root.contains(focused) && focused.id && ['INPUT', 'TEXTAREA'].includes(focused.tagName)
    ? {id: focused.id, start: focused.selectionStart, end: focused.selectionEnd} : null;
  return {
    endDialog: captureEndDialog(viewport),
    preview: (() => {const el=viewport.querySelector('[data-preview-draft]'), img=el?.querySelector('img.proof-preview-media'); return el ? {id:el.dataset.previewDraft,node:el,image:img,rect:img?.getBoundingClientRect()} : null;})(),
    sheet: viewport.querySelector('[data-sport-sheet]'),
    sheetRect: viewport.querySelector('[data-sport-sheet]')?.getBoundingClientRect(),
    sheetHeight: viewport.querySelector('[data-sport-sheet]')?.offsetHeight,
    cameraState: viewport.querySelector('[data-camera-state]')?.dataset.cameraState,
    nav: Boolean(viewport.querySelector('.bottom-nav')),
    category: root.querySelector('[data-category]')?.dataset.category,
    ready: root.querySelector('[data-ready]')?.dataset.ready,
    reached: root.querySelector('[data-checkin-goal]')?.dataset.reached,
    activeControl: viewport.contains(focused) && focused.dataset.action ? {action:focused.dataset.action,value:focused.dataset.value} : null,
    controlPaths: [...root.querySelectorAll('[data-checkin-control-icon] path')].map(el => el.getAttribute('d')),
    statuses: new Map([...root.querySelectorAll('[data-record-status]')].map(el=>[el.dataset.recordStatus,el.textContent])),
    page: root.dataset.checkinPage, phase: root.dataset.checkinPhase,
    owner: root.dataset.checkinOwner, session: root.dataset.checkinSession, rects, field,
    scrollTop: root.closest('[data-scroll-key]')?.scrollTop || 0,
    sport: root.querySelector('[data-checkin-sport-key]')?.dataset.checkinSportKey,
    numbers: new Map([...root.querySelectorAll('[data-checkin-number]')].map(el => [el.dataset.checkinNumber, el.dataset.motionValue || el.textContent])),
    selections: new Map([...root.querySelectorAll('.category-btn.selected, .sport-btn.selected')].map(el => [el.dataset.action, {value: el.dataset.value, rect: el.getBoundingClientRect()}])),
    disclosures: new Map([...root.querySelectorAll('[data-checkin-disclosure]')].map(el => [el.dataset.checkinDisclosure, el.open])),
    scroll: new Map([...root.querySelectorAll('[data-checkin-scroll]')].map(el => [el.dataset.checkinScroll, el.scrollLeft])),
    scrollY: new Map([...root.querySelectorAll('[data-checkin-scroll]')].map(el => [el.dataset.checkinScroll, el.scrollTop])),
    proofs: new Set([...root.querySelectorAll('.proof-card[data-draft-id]')].map(el => el.dataset.draftId)),
  };
}

export function sameCheckinSession(previous, root) {
  if (!previous || previous.owner !== root.dataset.checkinOwner) return false;
  return previous.session === root.dataset.checkinSession ||
    (previous.page === 'preparation' && root.dataset.checkinPage === 'running');
}

export function restoreCheckinLayout(viewport, previous, saved = new Map(), app) {
  connectSlideEnd(viewport, app);
  const root = viewport?.querySelector('[data-checkin-page]');
  if (viewport?.ownerDocument) restoreEndDialogAccess(viewport, root, previous);
  if (previous) saved.set(`${previous.owner}:${previous.session || ''}:${previous.page}`, previous.disclosures);
  if (!root) { connectCheckinMotion(viewport, previous, app); return; }
  const page = root.dataset.checkinPage, owner = root.dataset.checkinOwner;
  const sameOwner = previous?.owner === owner;
  const sameSession = sameCheckinSession(previous, root);
  const samePage = sameSession && previous.page === page;
  const disclosures = samePage ? previous.disclosures : saved.get(`${owner}:${root.dataset.checkinSession || ''}:${page}`);
  for (const el of root.querySelectorAll('[data-checkin-disclosure]')) {
    if (disclosures?.has(el.dataset.checkinDisclosure)) el.open = disclosures.get(el.dataset.checkinDisclosure);
  }
  if (sameSession) for (const el of root.querySelectorAll('[data-checkin-scroll]')) {
    el.scrollLeft = previous.scroll.get(el.dataset.checkinScroll) || 0;
    el.scrollTop = previous.scrollY?.get(el.dataset.checkinScroll) || 0;
  }
  const scroller = root.closest('[data-scroll-key]');
  if (scroller && samePage) scroller.scrollTop = previous.scrollTop || 0;
  else if (scroller && sameOwner && previous.page !== page && previous.page !== 'home') scroller.scrollTop = 0;
  if (scroller && page === 'records' && app?.ui.checkin?.restoreRecordScroll) {
    scroller.scrollTop = app.ui.checkin.recordListScroll || 0;
    app.ui.checkin.restoreRecordScroll = false;
  }
  if (samePage && previous.field && !viewport.querySelector('[role="alertdialog"], [role="dialog"]')) {
    const field = root.ownerDocument.getElementById(previous.field.id);
    if (field && root.contains(field) && !field.disabled) {
      field.focus({preventScroll: true});
      field.setSelectionRange(previous.field.start, previous.field.end);
    }
  }
  connectCheckinMotion(viewport, previous, app);
}
