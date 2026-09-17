# 学生属性“生源地”文案发布

- 日期：2026-09-16；源提交：e6c2032f。
- 学生端入班和个人资料共 6 处、管理端学生搜索/表头/详情/资料状态共 4 处改为“生源地”。教师端未发现独立同名学生属性文案。OCR 地域为服务配置，保留原文。
- Portal 从当前本地已提交源代码构建；学生端基于线上两个模块，仅替换本次文案。工作区其他未提交改动未打包。
- 检查：生产构建、Portal 两个 TypeScript 项目检查、地域映射测试 2/2、学生模块语法检查通过。
- 隔离候选容器 healthy，服务端入口哈希匹配；正式发布后门户、学生站、API readiness 均为 HTTP 200。
- 9 个门户公开资源及 2 个学生模块 SHA-256 与包内一致。另从本机读取公开 URL，确认“生源地”计数分别为 2、4、4。
- 后端容器 ID、镜像和启动时间一致；无数据库迁移。未进行真实账号登录后的浏览器验收。

## 发布及回滚

- 新版本：`/opt/bnbu-sports-production/releases/student-origin-20260916`。
- 回滚版本：`/opt/bnbu-sports-production/releases/course-settings-final-20260915`。
- 发布脚本：`tools/production/deploy-student-origin-20260916.py`；远端 `/home/ubuntu/bnbu-student-origin-20260916/deploy.py`。
- 发布过程中验证失败自动恢复旧入口和旧 Portal 镜像；本次未触发回滚。需要人工回滚时，原子恢复 current 到上述旧版本，并以旧目录执行 `docker compose up -d --no-deps --no-build --pull never portal`，随后验证健康与公开资源。
- 结果及公网验证：`evidence/student-origin-20260916/deployment-result.json`、`public-verification.json`。构建包和日志留在同目录及 `evidence/student-origin-build-20260916.log`。
- 本地存档，未推送 GitHub。
