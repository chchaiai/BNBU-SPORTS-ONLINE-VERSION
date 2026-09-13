# 学期切换顶部同步修复

2026-09-13，生产已部署并完成本项浏览器验收。

## 原因与修改

学期页在提交后刷新自己的列表；全局顶部只读取工作区初始化投影，导致切换成功后仍显示原学期。现在列表读取及提交后读取均向工作区发布服务端当前学期，并用版本计数防止初始化请求晚到覆盖最新结果。

修改文件为 `admin-semesters.tsx`、`admin-workspace.tsx`。沿用已有隔离构建目录，复制这两个文件后重新构建。第一次复制使用错误的相对路径，未成功，因此随后构建不作为修复验证；改用绝对路径复制后构建通过。学期展示及管理员领域测试 12/12 通过。

## 部署与浏览器证据

- 当前发布：`/opt/bnbu-sports-production/releases/semester-header-20260913`。
- 上一发布：`/opt/bnbu-sports-production/releases/public-note-locale-20260913`，保留可回滚；本次未演练回滚。
- Portal：`sha256:096d0d795bffda5bd3e84aa4dc90034ac173ce42fe45408dba20fcfd0297f61a`，healthy。
- Backend：`sha256:c7253e550053e45b5f40bb0d447e4c971db54790554b9d658b7d07d627118ccb`，healthy。
- 管理网页、学生网页和服务端就绪检查均 HTTP 200。
- 在独立合成组织 `01a09918-10d0-75ae-93a0-a4bf948d2495`，正常密码登录后，通过浏览器点击 Make current 和 Confirm switch。
- 无刷新情况下，顶部、页面标题、摘要及 CURRENT 行同步为 `Synthetic header synchronization acceptance`；Upcoming 0，Archived 4，原始归档课程仍为 1 / 1。
- 原始浏览器结构见 `evidence/ocr-triplatform-20260913/semester-header-browser.txt`。
- 合成管理员 `01a09918-10d1-735e-878f-c95e31d74da6` 已重新 DISABLED，tokenVersion 增加使测试会话失效。

测试目标通过真实 HTTP 创建，首次脚本误将成功的 201 断言为 200，创建已成功，未重试创建；浏览器读取并完成切换。脚本已修正为 201 并增加同名目标存在检查。目标使用合成年份及日期用于可立即执行的切换验证，不代表实际学校学期安排。合成记录保留待统一清理。

## 尚未完成

这只证明本项修复及独立组织的切换显示流程。整体 OCR 与三端 Web 全量验收仍有真实邮箱流程、文件选择权限、实际下载文件和业务规则澄清等待项，见总体验收审计；本项通过不代表整体目标完成。
