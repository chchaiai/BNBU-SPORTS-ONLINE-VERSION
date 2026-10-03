// Static branding is immediate; the optional WebGL renderer is loaded on demand.
export const METAL_LOGO_SRC = '/student/assets/bnbu-sports-electric.svg';

// Trace the complete emblem + SPORTS mask at the same coordinates as the image.
// The compact navigation mark needs thinner light to keep the lettering open.
export function electricBrandAppearance(key, theme) {
  const promo = ['promo-docked', 'promo-card'].includes(key);
  const dark = promo || theme === 'dark';
  const compact = key === 'navigation-home';
  return {
    theme: dark ? 'dark' : 'light',
    color: promo ? '#78baff' : dark ? '#f5fcff' : '#1678d5',
    glowColor: promo ? '#3692ff' : dark ? '#b3ddff' : '#166fff',
    intensity: promo ? .88 : compact ? 1.08 : 1.16,
    glow: promo ? .48 : compact ? .46 : .68,
    thickness: promo ? .19 : compact ? .18 : .22,
    strands: compact ? 2 : 3,
    bend: .10, crackle: .12, arcs: compact ? .24 : .42,
    flicker: .10, fill: 0, speed: 1.55,
    interactive: true, cursorIntensity: .55, cursorRadius: 30,
  };
}

export function electricBrand(key, size = 'promo') {
  return `<span class="electric-brand electric-brand--${size}" data-electric-logo="${key}" aria-hidden="true"><img class="electric-brand-image" src="${METAL_LOGO_SRC}" width="174" height="174" alt="" draggable="false"></span>`;
}

export function captureElectricBrands(root) {
  return new Map([...root.querySelectorAll('[data-electric-logo]')].map(node => [node.dataset.electricLogo, node]));
}

export function restoreElectricBrands(root, previous) {
  for (const replacement of root.querySelectorAll('[data-electric-logo]')) {
    const old = previous.get(replacement.dataset.electricLogo);
    if (old && old.className === replacement.className) replacement.replaceWith(old);
  }
}

// Exported to test asynchronous mount/dispose without requiring a GPU.
export function createElectricBrandManager({ loadRenderer, reducedMotion, document: doc }) {
  const entries = new Map();
  const motion = reducedMotion;
  const appearance = node => electricBrandAppearance(node.dataset.electricLogo, doc.documentElement?.dataset.theme);
  let disposed = false;
  const stop = entry => {
    entry.cancelled = true;
    entry.cleanup?.();
    entry.cleanup = null;
    entry.node.querySelectorAll('canvas').forEach(canvas => canvas.remove());
  };
  const sync = () => {
    if (disposed) return;
    const current = new Set(doc.querySelectorAll('[data-electric-logo]'));
    for (const [node, entry] of entries) {
      if (!current.has(node) || motion.matches) { stop(entry); entries.delete(node); }
    }
    for (const node of current) {
      if (motion.matches) { node.dataset.electricState = 'static'; continue; }
      if (entries.has(node)) { entries.get(node).cleanup?.update?.(appearance(node)); continue; }
      const entry = { node, cancelled: false, cleanup: null };
      entries.set(node, entry);
      node.dataset.electricState = 'loading';
      const fallback = () => {
        if (entry.cancelled) return;
        stop(entry);
        node.dataset.electricState = 'fallback';
      };
      Promise.resolve().then(loadRenderer).then(({ createElectricLogo }) => {
        if (entry.cancelled || !node.isConnected || motion.matches) return;
        entry.cleanup = createElectricLogo(node, {
          src: METAL_LOGO_SRC,
          ...appearance(node),
          onRender: () => { if (!entry.cancelled) node.dataset.electricState = 'ready'; },
          onFailure: fallback,
        });
        if (entry.cancelled) { entry.cleanup?.(); entry.cleanup = null; }
      }).catch(fallback);
    }
  };
  motion.addEventListener?.('change', sync);
  const dispose = () => {
    disposed = true;
    motion.removeEventListener?.('change', sync);
    entries.forEach(stop);
    entries.clear();
  };
  return { sync, dispose };
}

let manager;
let renderer;
let lifecycleAttached = false;
export function syncElectricBrands() {
  if (typeof document === 'undefined') return;
  if (!manager) {
    const requested = new URLSearchParams(window.location.search).get('logoMotion');
    const localPreview = ['127.0.0.1', 'localhost', '[::1]'].includes(window.location.hostname)
      && Boolean(document.querySelector('#experience-viewport'));
    const override = localPreview && ['full', 'reduced'].includes(requested) ? requested : null;
    const motion = override ? { matches: override === 'reduced' } : window.matchMedia('(prefers-reduced-motion: reduce)');
    document.documentElement.dataset.electricMotion = override || 'system';
    manager = createElectricBrandManager({
      document,
      reducedMotion: motion,
      loadRenderer: () => renderer ||= import('../vendor/electric-logo/electric-logo.js'),
    });
    if (!lifecycleAttached) {
      lifecycleAttached = true;
      window.addEventListener('pagehide', () => { manager?.dispose(); manager = null; });
      window.addEventListener('pageshow', () => syncElectricBrands());
    }
  }
  manager.sync();
}
