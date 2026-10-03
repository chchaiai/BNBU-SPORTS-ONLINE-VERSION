import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const evidence = path.join(root, 'evidence/student-experience-20261002');
const before = path.join(evidence, 'before');
const archive = path.join(evidence, 'reverted-version');
if (fs.existsSync(archive)) throw new Error('Rollback archive already exists; inspect before retrying.');
const student = 'BNBU-Sports-Web-new/frontend/student';
const preview = 'tools/local-integration/checkin-ui-preview';
const samePath = [
  `${student}/js/app.js`, `${student}/js/lazy-student-screens.js`,
  `${student}/js/app-download-promo.js`,
  ...['dashboard', 'courses', 'grades', 'profile', 'notifications', 'services', 'checkin'].map(name => `${student}/js/screens/${name}.js`),
  `${student}/index.html`, `${preview}/index.html`, `${preview}/scenes.html`,
];
const restore = [
  ...samePath.map(file => [file, file]),
  [`${student}/js/course-selection.js`, 'course-selection.js'],
  [`${student}/student-smoke.mjs`, 'student-smoke.mjs'],
  [`${preview}/experience.js`, 'experience.js'],
];
const remove = [
  `${student}/js/student-experience.js`, `${student}/js/application-proof-queue.js`,
  `${student}/css/student-experience.css`, `${student}/student-experience.test.mjs`,
];
const readmePath = `${preview}/README.md`;
const readme = fs.readFileSync(path.join(root, readmePath));
const marker = Buffer.from('\n## 学生端整体体验（2026-10-02）');
const markerAt = readme.indexOf(marker);
if (markerAt < 0 || readme.indexOf(marker, markerAt + 1) >= 0) throw new Error('README rollback marker is not unique.');
const suffix = readme.subarray(markerAt).toString('utf8').replaceAll('\r\n', '\n');
const expectedSuffix = '\n## 学生端整体体验（2026-10-02）\n\n默认首页已接入课程概览、记录与进度分段、通知分组、个人中心和申请材料队列。返回不同页面保留各自阅读位置，记录浏览与运动会话独立。\n\n`/?motion=reduced` 可在同一连续体验中检查减少动态效果；仅影响装饰动效，不改变计时、草稿或提交条件。申请和账户资料仍使用正式业务接口，本地静态服务只能预览表单与校验，不能确认正式申请或资料修改。\n';
if (suffix !== expectedSuffix) throw new Error('README has unexpected subsequent changes.');
for (const [file, backup] of restore) {
  if (!fs.statSync(path.join(root, file)).isFile() || !fs.statSync(path.join(before, backup)).isFile()) throw new Error(`Missing snapshot: ${file}`);
}
for (const file of remove) if (!fs.statSync(path.join(root, file)).isFile()) throw new Error(`Missing new file: ${file}`);
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const files = [...restore.map(([file]) => file), ...remove, readmePath];
const manifest = files.map(file => {
  const data = fs.readFileSync(path.join(root, file));
  const target = path.join(archive, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, data, { flag: 'wx' });
  return { file, archivedSha256: hash(data) };
});
for (const [file, backup] of restore) {
  fs.copyFileSync(path.join(before, backup), path.join(root, file));
  const actual = hash(fs.readFileSync(path.join(root, file)));
  if (actual !== hash(fs.readFileSync(path.join(before, backup)))) throw new Error(`Restore verification failed: ${file}`);
  Object.assign(manifest.find(entry => entry.file === file), { action: 'restored', backup, restoredSha256: actual });
}
for (const file of remove) {
  fs.unlinkSync(path.join(root, file));
  Object.assign(manifest.find(entry => entry.file === file), { action: 'removed-new-file' });
}
fs.writeFileSync(path.join(root, readmePath), readme.subarray(0, markerAt + 1));
Object.assign(manifest.find(entry => entry.file === readmePath), { action: 'removed-appended-section', restoredSha256: hash(fs.readFileSync(path.join(root, readmePath))) });
fs.writeFileSync(path.join(evidence, 'rollback-manifest.json'), JSON.stringify({ createdAt: new Date().toISOString(), files: manifest }, null, 2) + '\n');
console.log(`Restored ${restore.length} files from pre-change snapshots; archived and removed ${remove.length} added files; reverted README append.`);
