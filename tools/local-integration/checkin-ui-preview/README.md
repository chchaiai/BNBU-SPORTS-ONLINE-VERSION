# 学生打卡界面本地体验

从仓库根目录运行 `node tools/local-integration/checkin-ui-preview/server.cjs`。

默认入口：<http://127.0.0.1:4181/>。直接进入学生首页，无场景选择或加速按钮。旧入口的 scene 参数会移除，仍进入连续体验。

## 连续体验

- 首页 → 打卡 → 开始运动 → 暂停／继续 → 结束 → 填写说明 → 本地保存 → 查看记录。
- 从零按实际时间计时；最低 30 分钟，120 分钟自动结束。暂停不累计；返回首页或刷新后可恢复运动和凭证。
- 使用实际学生端的拍摄／文件选择、凭证处理、草稿保存、输入和会话逻辑。
- 本地提交逐项保存凭证到 IndexedDB，确认文件存在后写入本地记录；写入失败保留草稿，重试复用已保存凭证。记录 ID 按会话生成，重试不重复产生记录。
- 新记录显示待审核示例，未知计入时长显示为未知。刷新后可查看本机记录与凭证。
- 顶部始终标注本地体验。该预览没有后端连接，也不模拟正式服务器的媒体审核；提交进度显示本机保存状态，没有虚构网络速度、百分比或服务器确认。
- 使用独立的 `STUDENT-EXPERIENCE-LOCAL` 示例账户，场景测试页使用另一账户。

## 开发检查页

`/scenes.html` 仅用于检查状态与布局。示例标识常显，上传与确认均为模拟。它不出现在默认学生体验的导航内。

- `/scenes.html?scene=uploading&motion=full`：两张照片与一个视频的凭证队列。
- `/scenes.html?scene=filled`：完成记录，填写说明后可演示提交与失败重试。
- `/scenes.html?scene=finished`：空白运动说明与校验。
- `motion=reduced`：减少动态效果检查。

预览服务器仅监听回环地址，提供静态文件，拒绝 API 写入和代理。

检查：`node --test tools/local-integration/checkin-ui-preview/experience-storage.test.mjs BNBU-Sports-Web-new/frontend/student/checkin-proof-queue.test.mjs`
