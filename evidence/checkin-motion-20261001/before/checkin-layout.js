// Presentation continuity only: never writes exercise or evidence state.
export function isFocusedCheckin(state, session) {
  return state.tab === 'checkin' && !state.subScreen &&
    ['active', 'paused', 'finished'].includes(session?.phase);
}

export function captureCheckinLayout(viewport) {
  const root = viewport?.querySelector('[data-checkin-page]');
  if (!root) return null;
  const rects = new Map([...root.querySelectorAll('[data-checkin-motion]')].map(el =>
    [el.dataset.checkinMotion, {rect: el.getBoundingClientRect(), text: el.textContent}]));
  const focused = root.ownerDocument.activeElement;
  const field = root.contains(focused) && focused.id && ['INPUT', 'TEXTAREA'].includes(focused.tagName)
    ? {id: focused.id, start: focused.selectionStart, end: focused.selectionEnd} : null;
  return {
    page: root.dataset.checkinPage, owner: root.dataset.checkinOwner, rects, field,
    sport: root.querySelector('[data-checkin-sport-key]')?.dataset.checkinSportKey,
    disclosures: new Map([...root.querySelectorAll('[data-checkin-disclosure]')].map(el => [el.dataset.checkinDisclosure, el.open])),
    scroll: new Map([...root.querySelectorAll('[data-checkin-scroll]')].map(el => [el.dataset.checkinScroll, el.scrollLeft])),
    proofs: new Set([...root.querySelectorAll('[data-draft-id]')].map(el => el.dataset.draftId)),
  };
}

export function restoreCheckinLayout(viewport, previous, saved = new Map()) {
  const root = viewport?.querySelector('[data-checkin-page]');
  // Retain the previous stage's disclosures when visiting another tab.
  if (previous) saved.set(`${previous.owner}:${previous.page}`, previous.disclosures);
  if (!root) return;
  const page = root.dataset.checkinPage, owner = root.dataset.checkinOwner;
  const sameOwner = previous?.owner === owner;
  const samePage = sameOwner && previous.page === page;
  const disclosures = samePage ? previous.disclosures : saved.get(`${owner}:${page}`);
  for (const el of root.querySelectorAll('[data-checkin-disclosure]')) {
    if (disclosures?.has(el.dataset.checkinDisclosure)) el.open = disclosures.get(el.dataset.checkinDisclosure);
  }
  if (sameOwner) for (const el of root.querySelectorAll('[data-checkin-scroll]')) {
    el.scrollLeft = previous.scroll.get(el.dataset.checkinScroll) || 0;
  }
  if (samePage && previous.field && !viewport.querySelector('[role="alertdialog"], [role="dialog"]')) {
    const field = root.ownerDocument.getElementById(previous.field.id);
    if (field && root.contains(field) && !field.disabled) {
      field.focus({preventScroll: true});
      field.setSelectionRange(previous.field.start, previous.field.end);
    }
  }
  if (sameOwner && !samePage) {
    const scroller = root.closest('[data-scroll-key]');
    if (scroller) scroller.scrollTop = 0;
  }
  if (!sameOwner || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const animate = (el, frames, duration = 220) => el?.animate?.(frames, {
    duration, easing: 'cubic-bezier(.22, 1, .36, 1)',
  });
  if (!samePage) {
    for (const el of root.querySelectorAll('[data-checkin-motion]')) {
      const old = previous.rects.get(el.dataset.checkinMotion);
      const next = el.getBoundingClientRect();
      if (!old || !old.rect.width || !old.rect.height || !next.width || !next.height) continue;
      const bounds = viewport.getBoundingClientRect();
      if (old.rect.bottom < bounds.top || old.rect.top > bounds.bottom) continue;
      if (el.dataset.checkinMotion === 'sport' && old.text !== el.textContent) continue;
      const dx = old.rect.left - next.left, dy = old.rect.top - next.top;
      animate(el, [
        {transformOrigin: 'top left', transform: `translate(${dx}px, ${dy}px) scale(${old.rect.width / next.width}, ${old.rect.height / next.height})`},
        {transformOrigin: 'top left', transform: 'none'},
      ], 320);
    }
    for (const el of root.querySelectorAll('[data-checkin-enter]')) animate(el, [
      {opacity: 0, transform: 'translateY(8px)'}, {opacity: 1, transform: 'none'},
    ], 320);
  } else if (page === 'preparation' && previous.sport !== root.querySelector('[data-checkin-sport-key]')?.dataset.checkinSportKey) {
    animate(root.querySelector('.checkin-sport-hero'), [{opacity: .4, transform: 'translateY(4px)'}, {opacity: 1, transform: 'none'}]);
  }
  for (const el of root.querySelectorAll('.proof-card[data-draft-id]')) {
    if (!previous.proofs.has(el.dataset.draftId)) animate(el, [{opacity: 0, transform: 'translateY(8px)'}, {opacity: 1, transform: 'none'}]);
  }
}
