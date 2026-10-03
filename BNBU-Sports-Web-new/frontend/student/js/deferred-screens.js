import { tx } from './i18n.js';

export function createDeferredScreens(load, actionKey, exportsByScreen, actionsExport, backExport) {
  let module = null;
  let pending = null;
  let failed = false;
  const installed = new WeakSet();
  const relevant = app => Object.hasOwn(exportsByScreen, app.state.subScreen);
  function install(app) {
    if (!module || installed.has(app)) return;
    Object.assign(app.actions, module[actionsExport]);
    if (backExport) app.registerBackInterceptor(module[backExport]);
    installed.add(app);
  }
  function start(app) {
    if (!pending) {
      failed = false;
      pending = Promise.resolve().then(load).then(result => { module = result; })
        .catch(() => { failed = true; }).finally(() => { pending = null; });
    }
    return pending.then(() => {
      install(app);
      // A late download must not rerender a camera, form, or another page.
      if (relevant(app) && app.state.authenticated) app.render();
    });
  }
  return {
    render(app) {
      install(app);
      if (module) return module[exportsByScreen[app.state.subScreen]](app, app.state.subParams);
      // Browsers remember failed module imports. An explicit page reload resets
      // that cache; never refresh automatically while the user is working.
      app.actions[actionKey] = () => globalThis.location.reload();
      if (!pending && !failed) void start(app);
      return `<div class="screen-scroll" style="padding:24px">
        <button class="text-btn" data-action="root.back">${tx('返回', 'Back')}</button>
        <p role="${failed ? 'alert' : 'status'}">${failed ? tx('页面加载失败。可返回继续操作，或重新加载页面。', 'Page could not load. Go back to continue, or reload the page.') : tx('正在加载…', 'Loading…')}</p>
        ${failed ? `<button class="filled-btn" data-action="${actionKey}">${tx('重新加载页面', 'Reload page')}</button>` : ''}
      </div>`;
    },
  };
}

export const supportScreens = createDeferredScreens(
  () => import('./screens/support.js'), 'root.retrySupport',
  { help: 'renderHelpCenter', feedback: 'renderFeedback', about: 'renderAbout', changelog: 'renderChangelog' },
  'supportActions',
);
export const serviceScreens = createDeferredScreens(
  () => import('./screens/services.js'), 'root.retryServices',
  { endurance: 'renderEnduranceScoring', exemption: 'renderExemption' },
  'servicesActions', 'servicesBackInterceptor',
);
