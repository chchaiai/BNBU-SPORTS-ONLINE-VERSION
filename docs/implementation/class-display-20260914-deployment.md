# 学生账户展示精简部署记录

2026-09-14，代码提交 9f3f7b559556a47eb719985a46ad9e84359fda80（包含 0c68fefa）。

按页面批注删除学生列表行政班级列、详情班级块及对应搜索提示/匹配项。线上复验发现上一轮详情地域仍直接拼接编码，已补齐共用地域名称映射。

验证：目标 ESLint、完整 typecheck、生产构建通过；补齐详情后再次通过 ESLint、tsc 和生产构建。生产隔离候选容器 healthy，入口哈希一致，公开管理端/学生端/API ready/下载站均 HTTP 200。最终线上真实登录会话通过浏览器确认：学生表格加载完成，无行政班级列；详情已加载，无班级块，地域显示广东。

当前发布：/opt/bnbu-sports-production/releases/class-display-final-20260914。
即时回滚版本：/opt/bnbu-sports-production/releases/class-display-20260914（已删除班级展示，详情地域为旧显示）。本轮修改前版本 student-region-20260914 也保留。
即时回滚命令：sudo python3 /home/ubuntu/bnbu-class-display-final-20260914/deploy.py --rollback。
发布脚本：tools/production/deploy-class-display.py。部署证据：evidence/class-display-20260914/deployment.json。

无接口/数据库变更，无迁移，无业务数据写入。本次未演练回滚。浏览器验收为中文模式；英文展示由同一组件删除。代码和交接记录仅本地提交，未推送。
