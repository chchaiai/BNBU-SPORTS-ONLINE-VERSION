# 教师视频加载优化 2026-09-11

## 评估与实现
教师列表、相册、详情各自串行请求媒体元数据和播放链接，重复签名 URL 也降低浏览器复用视频下载的机会。此次优化复用现有私有媒体能力：
- 元数据与签名链接并行获取。
- 相同媒体并发请求合并，结果仅在当前页面内存中保存，最多 64 项、30 秒；提前 5 秒避开服务端签名过期。账号会话变化后清空，不写入持久存储。
- 失败不缓存，重新加载强制重新授权；未完成请求在账号变化后拒绝返回材料。
- 列表保持可见区域懒加载和 metadata 预加载；当前打开的视频详情使用 auto 预缓冲，点击播放后正常播放。

## 测量结果
线上同一个隔离测试账号、同一图片与视频记录，以浏览器 requestfinished 统计。
- 优化前列表每份材料依次请求元数据 166–174ms、签名 160–163ms，单份约 329–334ms 的 API 等待。
- 优化后两项并行，实测元数据 184–185ms、签名 194–195ms，单份 API 等待约 195ms。样本约减少 40%，这不是端到端视频首播时间或所有网络的保证。
- 列表切相册的媒体 API 请求由 4 次降为 0 次（本记录含图片和视频）；新详情播放也没有新增媒体 API 请求，播放 currentTime > 0。
- 首次对象读取实测仍约 1 秒；本轮未对视频原件转码、生成独立封面或引入 CDN。优先消除已测出的重复请求和串行等待；大文件与弱网的首次读取仍有优化空间。
- 早期测量脚本将 COS /media 路径归为 metadata；before 日志中第三个较长 GET 是对象请求，不计入上述两项 API 比较。后续脚本已按域名修正分类。

## 回归与部署
- TypeScript、新增访问模块及缩略图 ESLint、缓存并发/过期/强制刷新/账号切换/错误重试测试 PASS。
- 真实本地 Docker 浏览器：图片与视频解码、列表/相册切换、详情实际播放、免测材料、通知 PASS。
- 腾讯云相同回归 PASS，切相册与详情无新增媒体 API 请求有自动断言；隔离教师已重新停用并递增 tokenVersion。
- Linux portal 生产构建 PASS。源码 bd4402e8；镜像 bnbu-portal-production:teacher-media-20260911，ID sha256:21c18972ff6406eaed4a7bf76d5061d365dad0cc0384409bdb882e78a1b59108。
- 当前发布 /opt/bnbu-sports-production/releases/teacher-media-20260911；仅 portal 更新，健康及公网检查 PASS。
- 回滚版本 /opt/bnbu-sports-production/releases/teacher-preview-20260911，仅重建 portal 并恢复 current 链接；无需数据库变更。

## 交接
脚本 tools/local-integration/teacher-media-performance.mjs，设置 BNBU_PREVIEW_CLOUD=1 为云端，BNBU_MEDIA_EXPECT_REUSE=1 启用复用与播放断言。证据见 evidence/teacher-media-performance-20260911。测试采用隔离账号真实上传的合成素材，不代表全部实体设备与网络条件。此次无需新增云服务或权限，其他未完成学生端工作区变更未纳入发布。
