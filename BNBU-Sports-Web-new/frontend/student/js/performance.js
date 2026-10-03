/* One anonymous navigation sample. No URLs, account identifiers or tokens. */
(() => {
  if (!['www.student.bnbusports.cn', 'www.teacher.bnbusports.cn'].includes(location.hostname)) return;
  if (!globalThis.performance?.getEntriesByType || !globalThis.crypto?.getRandomValues) return;
  const random = crypto.getRandomValues(new Uint32Array(2));
  // Sample 20% of normal navigations; explicitly requested diagnostics use 100%.
  if (random[0] % 5 !== 0 && !new URLSearchParams(location.search).has('performance-diagnostic')) return;
  const id = Array.from(random, n => n.toString(16).padStart(8, '0')).join('');
  let sent = false;
  const bounded = value => Math.max(0, Math.min(600000, Math.round(Number(value) || 0)));
  function send() {
    if (sent) return;
    const nav = performance.getEntriesByType('navigation')[0];
    if (!nav) return;
    sent = true;
    const resources = performance.getEntriesByType('resource');
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const ready = performance.getEntriesByName('bnbu:ready')[0];
    const data = new URLSearchParams({ v: '1', id,
      dns: bounded(nav.domainLookupEnd - nav.domainLookupStart),
      connect: bounded(nav.connectEnd - nav.connectStart),
      tls: bounded(nav.secureConnectionStart ? nav.connectEnd - nav.secureConnectionStart : 0),
      wait: bounded(nav.responseStart - nav.requestStart),
      download: bounded(nav.responseEnd - nav.responseStart),
      ttfb: bounded(nav.responseStart), fcp: bounded(fcp?.startTime), ready: bounded(ready?.startTime),
      load: bounded(nav.loadEventEnd), count: bounded(resources.length),
      bytes: Math.min(100000000, resources.reduce((sum, row) => sum + (row.transferSize || 0), 0)),
      protocol: ['h2','h3','http/1.1'].includes(nav.nextHopProtocol) ? nav.nextHopProtocol : 'other',
      restored: nav.type === 'back_forward' ? '1' : '0',
    });
    // A failed report never retries or affects application requests.
    void fetch('/__performance?' + data, { method: 'GET', credentials: 'omit', cache: 'no-store',
      keepalive: true, referrerPolicy: 'no-referrer' }).catch(() => {});
  }
  addEventListener('pagehide', send, { once: true });
  if (document.readyState === 'complete') setTimeout(send, 15000);
  else addEventListener('load', () => setTimeout(send, 15000), { once: true });
  setTimeout(send, 60000);
})();
