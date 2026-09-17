# iPhone 视频处理修复与部署 — 2026-09-15

## 结果

已部署至 `https://www.student.bnbusports.cn/student/`。

- 当前发布：`/opt/bnbu-sports-production/releases/iphone-video-20260915-r2`。
- 回滚版本：`/opt/bnbu-sports-production/releases/profile-quality-20260915`。
- 后端镜像与健康状态在部署前后相同；本次没有后端或数据库变更。
- 本次改动限学生端 5 个脚本及学生端 WASM 响应类型配置。源工作区已有其他并行修改；未提交 Git。

## 诊断边界与修复

截图中的“暂未完成格式处理”由保存原件之后的统一 catch 产生。原有流程将所有视频重新编码，并让转码程序加载、编码及封面生成共用 90 秒超时。实际异常被丢弃，截图不能证明具体设备失败于哪一步。第二张截图的网络提示也不能证明断网：原有分类把所有非 API 异常映射为网络失败。

1. 检测视频流：H.264/yuv420p、最长边不超过 1920 且含 AAC 音轨的素材优先整理 MP4 封装；其余素材继续转为 H.264/AAC。
2. 整理封装和转码均移除源位置元数据，保留视频音轨；继续校验最终时长及解码封面。不按扩展名直接放行原件。
3. 加载、读取、探测、整理、编码和封面校验分别限时。解码和编码限制线程数；生成封面前释放 Worker 中的源文件。
4. Worker 错误立即拒绝等待中的请求；界面按失败阶段给出重试提示，原件仍保留。
5. 打卡草稿序列化为 ArrayBuffer，读出时恢复 Blob；兼容旧 Blob 草稿，保存与删除串行执行。
6. 本机草稿保存错误显示存储提示，不再提示检查网络。
7. WASM 响应改为 `application/wasm`；更新资源查询版本以避开旧缓存响应类型。

## 验证

- 14 项相关单元测试通过：视频时长、预览元数据、上传重试、错误映射、Worker 启动失败。
- 5 类素材经实际发布用 WASM 处理：普通 MP4、碎片 MP4、带位置及旋转信息 MP4、WebM、合成 10-bit HEVC。
- 输出均为 H.264/AAC；位置标签移除，旋转方向保留；5 个输出通过本地已构建 Backend MediaValidator 校验。该项是本地验证器检查，不是线上业务提交验收。
- 本地真实浏览器 Worker 与视频播放通过；验证草稿字节一致、刷新恢复、旧草稿兼容、保存期间删除不复活。
- 线上 5 个脚本 SHA-256 与包内一致；WASM 类型为 `application/wasm`。
- 线上真实桌面浏览器加载发布代码，使用合成视频完成整理及播放，无页面异常；本次约 4.4 秒，包含冷加载。此时间不能作为手机性能保证。
- 首次发布的响应类型校验发生在 Nginx 新 Worker 接管之前，脚本自动回滚。第二次加入最多 10 次、间隔 1 秒的重载等待；观测值由 `application/octet-stream` 变为 `application/wasm`，发布通过。首次失败版本保留在服务器。

证据：`evidence/iphone-video-20260915/{conversion,browser,live-browser,deployment}.json`。

## 剩余验收

尚未取得用户原视频与受影响 iPhone 的运行日志，未完成该设备 Safari/微信真机复验，也未使用用户账号提交打卡。学生可在原浏览器中刷新页面后点击“重试视频处理”；应保留站点数据，避免删除待处理原件。

## 回滚

确认没有后续发布后，将 `/opt/bnbu-sports-production/current` 原子切回上述回滚版本，恢复该版本 `nginx.conf` 至 `/etc/nginx/sites-available/bnbu-staging-hk.conf`，运行 `nginx -t` 后重载 Nginx，并核对入口、静态文件和后端健康状态。此次回滚无需重启后端。
