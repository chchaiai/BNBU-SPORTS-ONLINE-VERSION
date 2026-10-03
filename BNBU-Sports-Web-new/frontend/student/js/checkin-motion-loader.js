// Optional presentation code: failure must never block an exercise action.
export function createMotionLoader(load) {
  let pending;
  return () => pending ||= Promise.resolve().then(load).catch(() => null);
}

let runtime;
const ready = createMotionLoader(() => import('./checkin-motion.js').then(module => (runtime = module)));
const revisions = new WeakMap();

export const controlGlyphPaths = paused => paused
  ? ['M7 4 L13 8 L13 16 L7 20 Z', 'M13 8 L20 12 L20 12 L13 16 Z']
  : ['M6 5 L10 5 L10 19 L6 19 Z', 'M14 5 L18 5 L18 19 L14 19 Z'];

export function queueCheckinSuccess(app, owner, recordId) {
  if (owner && recordId) app._checkinCelebration = {owner, recordId};
}

export function consumeCheckinSuccess(app, root) {
  const event = app?._checkinCelebration;
  if (!event) return null;
  delete app._checkinCelebration;
  return root?.dataset.checkinPage === 'submitted' && root.dataset.checkinOwner === event.owner ? event : null;
}

export function updateCheckinNumber(element, value) {
  if (!element) return;
  if (runtime) runtime.updateNumber(element, value);
  else element.textContent = value;
}

export function connectCheckinMotion(viewport, previous, app) {
  if (!viewport || typeof document === 'undefined') return;
  const revision = (revisions.get(viewport) || 0) + 1;
  revisions.set(viewport, revision);
  const root = viewport.querySelector('[data-checkin-page]');
  if (!root) {
    runtime?.disconnect(viewport);
    consumeCheckinSuccess(app, null);
    return;
  }
  void ready().then(module => {
    if (revisions.get(viewport) !== revision || !root.isConnected) return;
    const success = consumeCheckinSuccess(app, root);
    module?.connect(viewport, root, previous, success, app);
  }).catch(() => { /* Animation failure leaves rendered controls operational. */ });
}

// Only used by the labelled local preview. Does not submit or alter records.
export async function previewCheckinCelebration(viewport) {
  const module = await ready();
  const root = viewport?.querySelector('[data-checkin-page="submitted"]');
  if (root) await module?.celebrate(viewport, root).catch(() => module?.disconnect(viewport));
}
