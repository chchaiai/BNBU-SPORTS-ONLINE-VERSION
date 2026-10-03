# 已按用户要求撤回 · 2026-10-02

此前 ACCEPTANCE.md 记录的首页、课程、记录与进度、通知、个人中心及申请表单优化已撤回。该验收文档和截图仅保留为历史证据，不再代表当前预览。

- 从本轮修改前的 before/ 备份恢复 16 个原有文件，逐文件 SHA-256 与备份一致。
- 移除本轮新增的 student-experience.js、student-experience.css、application-proof-queue.js 和 student-experience.test.mjs；去掉预览 README 的本轮追加段落。
- 被撤回的版本已完整保存在 reverted-version/，对应操作与校验值见 rollback-manifest.json。
- 此前的打卡动效、凭证上传队列、真实计时连续预览及首页图标修复保留。
- 60 项针对性检查通过，见 rollback-tests.log。恢复的 smoke 测试为 86 项通过、1 项原有失败：课程文案断言仍要求“每学期仅可选择一门课程”，与已有 maximumActiveEnrollments 分支文案不符，见 rollback-smoke.log。
- 本地 4181 预览已刷新；首页恢复旧布局，进入打卡仍为原有 02:00:00 完成记录草稿，随后返回首页。未清理浏览器存储或提交记录。

仅撤回本次本地改动，未执行 Git 提交、推送或部署。
