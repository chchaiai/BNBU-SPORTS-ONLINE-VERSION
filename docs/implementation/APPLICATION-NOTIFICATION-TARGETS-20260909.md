# 教师免测与认证通知具体对象定位

2026-09-09 13:04。本轮 EXEMPTION_APPLICATION 通知按服务器 targetId 在当前教师可见申请集中定位，打开原有审核详情弹窗；待审默认批准选项，其余状态只查看，继续使用现有权限、版本和恢复逻辑。匹配不到明确提示。UI 布局和后端均无变化。

Portal 完整类型检查通过：notification-application-typecheck-20260909.txt。真实 Edge / 本地 Docker 后端，合成通知引用原有已关闭课程中的免测、认证持久化申请。验证通知点击后详情内包含对应申请的特有说明；回归课程与打卡两种对象。notification-application-browser-20260909.txt 共 4/4 通过，无本轮失败。截图 notification-target-physical.png、notification-target-certification.png。

seed-v81-notification-targets.mjs 扩充两种申请引用，仍明确为合成通知；不是线上教师事件投递证明。浏览器脚本逐项刷新、通过真实登录与通知列表读取，无 mock 请求。前序后端 Docker 验收保留原范围，本轮没有声称新增全量后端测试结果。

OCR 接线发现：当前 teacher-workspace.tsx、roster-reconciliation.tsx 没有 OCR 上传/草稿核对入口；已有后端接口和 Docker 续办证据不能证明网页可操作。已向用户请求允许在现有名单导入和体测弹窗内增加必要图片与草稿核对内容，以协调原 UI/UX 限制；答复前不执行依赖此授权的 UI 工作。仍可继续其他通知定位和后端验证。
