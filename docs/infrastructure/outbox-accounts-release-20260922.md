# 媒体事件操作人与账号预加载发布

- 功能提交：`7ce10f08`。
- 线上版本：`/opt/bnbu-sports-production/releases/outbox-accounts-20260922`。
- 回滚版本：`/opt/bnbu-sports-production/releases/dual-class-20260922`。
- 范围：后台 Outbox 查询模块及其 source map、管理端构建资源。没有数据库迁移，学生静态资源继承上一版本。
- 管理员进入管理端即预加载完整学生/教师列表，共享请求与内存缓存；缓存过期时先显示已有内容并刷新，账号切换隔离缓存，修改账号后强制更新。
- 媒体事件通过组织、媒体 ID、事件版本关联状态流水，兼容缺少 requestId 的历史 Outbox 记录；WORKER 显示系统自动处理。

## 验证

前后端类型检查、管理端构建、3 项缓存测试、1 项使用本地 PostgreSQL 临时表的关联测试通过。候选管理端镜像健康。上线前后均通过只读事务调用候选/上线后台查询模块：北京时间 2026-09-22 19:14:35 至 19:14:55 的 6 条媒体事件中，4 条用户事件有操作人，2 条后台事件标识为 SYSTEM。未输出姓名或邮箱。上线后台模块摘要及 9 个公开管理端资源摘要一致，管理端/学生端 HTTP 和 readiness 正常。

本次未执行真实管理员浏览器交互验收；账号预加载通过自动化缓存测试、构建和上线资源摘要确认交付。

## 回滚

已完成数据库备份并检查备份目录，路径与镜像摘要见 `evidence/outbox-accounts-20260922/deployment.json`。在生产服务器执行：

```bash
sudo python3 /home/ubuntu/bnbu-outbox-accounts-20260922/bundle/deploy.py --rollback
```

脚本要求 current 仍为本次版本，启动上一版后台和管理端后切换 current 并检查公共服务；不回滚数据库。
