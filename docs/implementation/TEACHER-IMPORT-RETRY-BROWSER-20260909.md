# 教师批量建号丢响应恢复 2026-09-09

本地 Edge 管理员网页连接持续 Docker 后端和 PostgreSQL。对两个全新自定义邮箱域名的合成教师进行 CSV 预览和确认，测试拦截器先让后端完成创建，再丢弃第一次成功响应。页面显示失败后，点击原确认按钮再次提交：两次请求使用同一个非空幂等键，响应 data 完全一致，createdCount 为 2；关闭弹窗后账号可见，刷新重新进入列表仍可读。

teacher-import-retry-browser-20260909.txt 退出 0。脚本 tools/local-integration/v81-teacher-import-retry-browser-probe.mjs；合成账号与随机初始密码只保存在忽略目录 teacher-import-retry-current.json。没有删除账号或覆盖上一轮首次改密问题夹具。

本轮未修改产品源码。验证只覆盖同页原内容重试及成功后的刷新回读，不覆盖结果未确认时修改表单、关闭重开、整页刷新恢复或首次改密。首次改密缺口及正式结算入口仍按 TEACHER-IMPORT-BROWSER-20260909.md 记录，两项最小界面调整问题保持待用户答复。