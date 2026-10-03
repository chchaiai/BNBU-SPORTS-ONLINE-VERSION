import { tx } from './i18n.js';
import { localStore } from './store.js';

export function createScreenModule(load, actionsName, initialize) {
  let module, pending, failed = false;
  const installed = new WeakSet();
  function install(app) {
    if (module && !installed.has(app)) {
      Object.assign(app.actions, module[actionsName] || {});
      installed.add(app);
    }
  }
  async function ready(app) {
    if (!pending) pending = Promise.resolve().then(load).then(value => { module = value; return value; })
      .catch(error => { failed = true; throw error; });
    const value = await pending;
    install(app);
    return value;
  }
  const preparations = new WeakMap();
  function prepare(app) {
    const workspace = app.state.workspace;
    if (preparations.get(app)?.workspace === workspace) return preparations.get(app).promise;
    const promise = ready(app).then(async value => {
      if (app.state.workspace !== workspace) return;
      await initialize?.(value, app, () => app.state.workspace === workspace && app.state.authenticated);
    });
    preparations.set(app, { workspace, promise });
    return promise;
  }
  return {
    ready, prepare,
    call(name, ...args) { return module?.[name]?.(...args); },
    render(name, app, ...args) {
      install(app);
      if (module) return module[name](app, ...args);
      const screen = app.screenKey();
      if (!failed) void prepare(app).then(() => {
        if (app.screenKey() === screen) app.render();
      }).catch(() => { if (app.screenKey() === screen) app.render(); });
      app.actions['root.reloadScreen'] = () => globalThis.location.reload();
      return `<div class="screen-scroll" style="padding:24px"><p role="${failed ? 'alert' : 'status'}">${failed
        ? tx('页面加载失败，可返回后重试或重新加载页面。', 'Could not load this page. Go back or reload the page.')
        : tx('正在加载…', 'Loading…')}</p>${failed ? `<button class="filled-btn" data-action="root.reloadScreen">${tx('重新加载页面', 'Reload page')}</button>` : ''}</div>`;
    },
  };
}

const checkin = createScreenModule(() => import('./screens/checkin.js'), 'checkinActions',
  (module, app, current) => module.restoreCheckinContinuity(app, current));
const courses = createScreenModule(() => import('./screens/courses.js'), 'coursesActions');
const grades = createScreenModule(() => import('./screens/grades.js'));
const profile = createScreenModule(() => import('./screens/profile.js'), 'profileActions');

const renderer = (feature, name) => (app, ...args) => feature.render(name, app, ...args);
export const renderCheckIn = renderer(checkin, 'renderCheckIn');
export const renderCourses = renderer(courses, 'renderCourses');
export const renderGrades = renderer(grades, 'renderGrades');
export const renderRequiredProfile = renderer(profile, 'renderRequiredProfile');
export const renderProfile = renderer(profile, 'renderProfile');
export const renderAccountDetails = renderer(profile, 'renderAccountDetails');
export const renderSettings = renderer(profile, 'renderSettings');
export const renderAccountDeletion = renderer(profile, 'renderAccountDeletion');
export const coursesActions = {}, profileActions = {};
export const checkinActions = {
  // This action is also reachable from the dashboard before Check-in loads.
  async 'checkin.selectProof'(app, element) {
    const workspace = app.state.workspace;
    const screen = app.screenKey();
    try {
      const module = await checkin.ready(app);
      if (workspace === app.state.workspace && app.screenKey() === screen && app.state.authenticated)
        return module.checkinActions['checkin.selectProof'](app, element);
    } catch { app.selectTab('checkin'); }
  },
};
export const checkinTick = app => checkin.call('checkinTick', app);
export const attachDraftVideoPreview = app => checkin.call('attachDraftVideoPreview', app);
export const checkinBackInterceptor = app => checkin.call('checkinBackInterceptor', app) ?? false;
export const coursesBackInterceptor = app => courses.call('coursesBackInterceptor', app) ?? false;

function needsExerciseModule(app) {
  const owner = app.state.workspace?.student?.id;
  const session = owner ? localStore.getExerciseSession(owner) : null;
  return app.state.tab === 'checkin' || !!app.ui.checkin || !!app.state.workspace?.activeServerSession
    || ['active', 'paused', 'finished'].includes(session?.phase);
}
export async function restoreCheckinContinuity(app, current = () => true) {
  if (!needsExerciseModule(app) || !current()) return;
  const module = await checkin.ready(app);
  if (current()) await module.restoreCheckinContinuity(app, current);
}
export async function resumeCheckinContinuity(app) {
  if (!app.state.authenticated || !needsExerciseModule(app)) return;
  const workspace = app.state.workspace;
  try {
    const module = await checkin.ready(app);
    if (workspace === app.state.workspace && app.state.authenticated) await module.resumeCheckinContinuity(app);
  } catch { /* Page entry exposes a retry; background resume must not reject. */ }
}
