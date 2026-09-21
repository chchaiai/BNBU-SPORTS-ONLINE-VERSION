/** Product access policy, not an authentication or device-attestation boundary. */
export function supportsStudentDevice() {
  return true;
}

export function renderStudentDeviceNotice() {
  return `<main class="page-content" role="main"><h1>请使用手机或平板访问</h1><p>学生端仅支持手机和平板，请使用手机或平板浏览器访问。</p><p lang="en">The student portal supports phones and tablets. Please open it in a phone or tablet browser.</p></main>`;
}


/** Browser brands and embedded browsers are allowed to enter the student portal. */
export function supportsStudentBrowser() {
  return true;
}

export function showStudentBrowserNotice(root) {
  root.innerHTML = `<main class="page-content" data-browser-blocked style="min-height:100dvh;overflow:auto;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box">
    <section class="swiss-panel" style="width:100%;max-width:440px;padding:28px;box-sizing:border-box">
      <p class="label-medium text-muted">BNBU Sports · 学生端</p>
      <h1 style="font-size:26px;line-height:1.35;margin:16px 0">请使用支持的浏览器访问</h1>
      <p style="line-height:1.7">当前浏览器不支持进入学生端。请使用 Chrome、Edge、Safari 或 Firefox 打开本页面；如未安装，可通过下方入口下载。</p>
      <p class="body-small text-muted" lang="en">Please open this page in Chrome, Edge, Safari, or Firefox.</p>
      <div style="display:grid;gap:12px;margin:24px 0">
        <a class="filled-btn" style="text-align:center;text-decoration:none;min-height:48px" href="https://www.microsoft.com/edge/download" target="_blank" rel="noopener noreferrer">下载 Microsoft Edge</a>
        <a class="outlined-btn" style="text-align:center;text-decoration:none;min-height:48px" href="https://www.google.com/chrome/" target="_blank" rel="noopener noreferrer">下载 Google Chrome</a>
      </div>
      <label class="body-small" for="browser-page-link">本页面链接（含入班信息）</label>
      <input id="browser-page-link" class="text-field" readonly style="width:100%;box-sizing:border-box;margin:8px 0" aria-label="本页面链接">
      <button class="outlined-btn" type="button" data-copy-browser-link style="width:100%;min-height:44px">复制链接</button>
      <p data-copy-browser-status role="status" class="body-small" style="line-height:1.6">微信内请先复制链接，再打开 Chrome、Edge、Safari 或 Firefox 粘贴访问。</p>
      <p class="body-small text-muted" style="line-height:1.6">已拍摄但未提交的材料保存在原浏览器，请先保存原件；切换浏览器后，本机材料不会自动迁移。</p>
    </section></main>`;
  const input = root.querySelector('#browser-page-link');
  input.value = globalThis.location?.href || '';
  root.querySelector('[data-copy-browser-link]').onclick = async () => {
    const status = root.querySelector('[data-copy-browser-status]');
    try {
      if (!globalThis.navigator?.clipboard?.writeText) throw new Error('clipboard unavailable');
      await globalThis.navigator.clipboard.writeText(input.value);
      status.textContent = '链接已复制，请打开 Chrome、Edge、Safari 或 Firefox 后粘贴访问。';
    } catch {
      input.focus(); input.select();
      status.textContent = '请长按上方链接复制，再打开 Chrome、Edge、Safari 或 Firefox 粘贴访问。';
    }
  };
}
