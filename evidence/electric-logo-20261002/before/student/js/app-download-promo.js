import { tx } from './i18n.js';
export function renderAppDownloadPromo() {
  return `<a class="app-download-promo" href="https://www.bnbusports.cn/"><img src="/student/bnbu-sports-icon.svg" width="40" height="40" alt=""><span class="app-download-promo-copy"><span class="app-download-promo-label">${tx('BNBU SPORTS · 手机APP', 'BNBU SPORTS · MOBILE APP')}</span><strong>${tx('BNBU Sports APP 现已开放测试啦！', 'BNBU Sports APP beta is now open!')}</strong><small>${tx('iPhone / Android / 华为鸿蒙 · 查看安装指引', 'iPhone / Android / HarmonyOS · Installation guide')}</small></span><span class="app-download-promo-arrow" aria-hidden="true">↗</span></a>`;
}

let announcementShown = false;

export function showAppBetaAnnouncement(screenKey, blocked = false) {
  const eligible = ['login', 'tab-dashboard'].includes(screenKey) && !blocked;
  document.body.classList.toggle('app-beta-entry-hidden', !eligible);
  const ready = document.querySelector('.login-screen, .main-shell');
  if (announcementShown || !eligible || !ready || document.querySelector('dialog[open], [aria-modal="true"]')) return;
  announcementShown = true;
  const dialog = document.createElement('dialog');
  dialog.className = 'app-beta-dialog';
  dialog.setAttribute('aria-labelledby', 'app-beta-title');
  dialog.setAttribute('aria-describedby', 'app-beta-description');
  dialog.innerHTML = `<div class="app-beta-dialog-content">
    <div class="app-beta-dialog-brand"><img src="/student/bnbu-sports-icon.svg" width="48" height="48" alt=""><span>BNBU SPORTS · 手机APP</span><span class="app-beta-tag">内测开放</span></div>
    <h2 id="app-beta-title">BNBU Sports APP端<br>内测开放啦</h2>
    <div id="app-beta-description"><p>iOS、Android 手机端现已开放内测，华为／鸿蒙手机也可查看对应安装指引。</p><p>安装后使用自己的学校邮箱登录，即可体验体育打卡、运动记录与学时查询。欢迎加入对应测试群，反馈使用中遇到的问题。</p></div>
    <a class="app-beta-dialog-guide" href="https://www.bnbusports.cn/">查看下载与安装指南 →</a>
    <button class="app-beta-ack" type="button" autofocus>我知道了</button>
    <p class="app-beta-dialog-hint">点击后收起至底部，随时查看安装指引</p>
  </div>`;
  document.body.append(dialog);
  let dismissing = false;
  const dismiss = async () => {
    if (dismissing) return;
    dismissing = true;
    const target = document.createElement('a');
    target.className = 'app-beta-bottom-entry';
    target.href = 'https://www.bnbusports.cn/';
    target.innerHTML = '<img src="/student/bnbu-sports-icon.svg" width="32" height="32" alt=""><span><strong>BNBU Sports APP 内测已开放</strong><small>查看下载与安装指南</small></span><span class="app-beta-bottom-arrow" aria-hidden="true">↗</span>';
    target.style.visibility = 'hidden';
    document.body.append(target);
    // The acknowledgement explicitly starts the requested full docking animation.
    const from = dialog.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const content = dialog.querySelector('.app-beta-dialog-content');
    const compact = document.createElement('div');
    compact.className = 'app-beta-morph-label';
    compact.innerHTML = target.innerHTML;
    compact.setAttribute('aria-hidden', 'true');
    const surface = document.createElement('div');
    surface.className = 'app-beta-morph-surface';
    surface.setAttribute('aria-hidden', 'true');
    dialog.prepend(surface);
    dialog.append(compact);
    const dx = to.left - from.left;
    const dy = to.top - from.top;
    const sx = to.width / from.width;
    const sy = to.height / from.height;
    Object.assign(dialog.style, {
      inset: 'auto', margin: '0', left: from.left + 'px', top: from.top + 'px',
      width: from.width + 'px', height: from.height + 'px', maxHeight: 'none',
      boxSizing: 'border-box', overflow: 'visible', minWidth: '0', border: '0',
      background: 'transparent', boxShadow: 'none', pointerEvents: 'none',
    });
    Object.assign(compact.style, { width: to.width + 'px', height: to.height + 'px', inset: '0 auto auto 0' });
    dialog.classList.add('is-dismissing');
    const duration = 1650;
    const easing = 'cubic-bezier(.36,0,.18,1)';
    const timing = { duration, easing, fill: 'forwards' };
    dialog.querySelector('.app-beta-ack').textContent = '正在收起…';
    // Surface and text move separately: glyphs retain their size while the card folds.
    Object.assign(content.style, { position: 'absolute', inset: '0', width: from.width + 'px', height: from.height + 'px', boxSizing: 'border-box' });
    content.animate([
      { transform: 'translate(0,0)', clipPath: 'inset(0 0 0 0 round 24px)' },
      { transform: 'translate(' + dx + 'px,' + dy + 'px)', clipPath: 'inset(0 ' + Math.max(0, from.width - to.width) + 'px ' + Math.max(0, from.height - to.height) + 'px 0 round 18px)' },
    ], timing);
    content.animate([
      { opacity: 1, offset: 0 }, { opacity: 1, offset: .12 },
      { opacity: 0, offset: .4 }, { opacity: 0, offset: 1 },
    ], { duration, fill: 'forwards', easing: 'ease-in-out' });
    const labelX = (from.width - to.width) / 2;
    const labelY = (from.height - to.height) / 2;
    compact.animate([
      { transform: 'translate(' + labelX + 'px,' + labelY + 'px)' },
      { transform: 'translate(' + dx + 'px,' + dy + 'px)' },
    ], timing);
    compact.animate([
      { opacity: 0, offset: 0 }, { opacity: 0, offset: .3 },
      { opacity: 1, offset: .64 }, { opacity: 1, offset: 1 },
    ], { duration, fill: 'forwards' });
    const surfaceMotion = surface.animate([
      { transform: 'translate(0,0) scale(1,1)', borderRadius: '24px' },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')', borderRadius: (18 / sx) + 'px / ' + (18 / sy) + 'px' },
    ], timing);
    surface.animate([
      { background: '#ffffff', offset: 0 }, { background: '#ffffff', offset: .18 },
      { background: '#075de8', offset: .64 }, { background: '#075de8', offset: 1 },
    ], { duration, easing: 'ease-in-out', fill: 'forwards' });
    try {
      await surfaceMotion.finished;
    } finally {
      target.style.visibility = '';
      document.body.classList.add('app-beta-docked');
      dialog.close();
      dialog.remove();
      target.focus({ preventScroll: true });
    }
  };
  dialog.querySelector('.app-beta-ack').addEventListener('click', dismiss);
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
  dialog.showModal();
}
