/** Product access policy, not an authentication or device-attestation boundary. */
export function supportsStudentDevice(navigatorInfo = globalThis.navigator) {
  const ua = navigatorInfo?.userAgent || '';
  if (/iPhone|iPad|iPod|Android|Windows Phone/i.test(ua)) return true;
  // iPadOS requests desktop sites and identifies itself as a Mac.
  return /Macintosh/i.test(ua) && Number(navigatorInfo?.maxTouchPoints) > 1;
}

export function renderStudentDeviceNotice() {
  return `<main class="page-content" role="main"><h1>请使用手机或平板访问</h1><p>学生端仅支持手机和平板，请使用手机或平板浏览器访问。</p><p lang="en">The student portal supports phones and tablets. Please open it in a phone or tablet browser.</p></main>`;
}
