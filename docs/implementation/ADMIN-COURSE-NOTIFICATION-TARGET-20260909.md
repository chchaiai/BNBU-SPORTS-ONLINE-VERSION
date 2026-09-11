# 管理员课程通知定位

2026-09-09 13:11。CLASS_SECTION 通知传给现有管理员课程目录，在已加载且当前账号可见的课程集合中匹配 targetId，清除筛选、展开该卡片并滚动定位。当前目录仅含当前学期未关闭课程，因此关闭/归档/不在范围中的目标明确提示，不自动展示其他课程。错误提示与目录加载错误分别保存，打开下一个合法目标时清除旧定位错误。无 CSS 或布局修改。

真实 Edge + 本地 Docker HTTP 浏览器：admin-course-notification-browser-20260909.txt 两项通过。先打开已关闭课程目标，确认错误且没有展开卡片；不刷新页面，再打开有效课程目标，确认该 ID 卡片 aria-expanded=true 且旧错误消失。admin-course-notification.png 保存了展开卡片。测试通知由隔离 v81_browser_test 中的显式合成 seed 建立，仅验证导航，不代表线上通知投递。该流程没有修改课程业务。

Portal 完整 typecheck 通过：admin-course-notification-typecheck-final-20260909.txt；早期检查也通过。后端/协议/迁移未变，未扩大前序 Docker 全量结论。权限失效沿用原 AdminPage 权限检查和目录后端范围控制，本轮没有单独执行权限动态撤销用例。

剩余：管理员账号等通知、教师成员/名单/报告通知、全范围验收；网页 OCR 必要弹窗调整仍等待用户答复。
