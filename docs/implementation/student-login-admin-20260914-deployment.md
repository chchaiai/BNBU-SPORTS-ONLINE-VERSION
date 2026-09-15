# 学生登录与学生账户管理修复：香港发布记录

日期：2026-09-14。用户明确要求部署本对话修复，应用来源为本地存档 d34e3e38bade4bb53d4c1ac8d4bd4b2adb04a3bc。

## 发布结果

PASS。香港 CVM 43.129.193.7（VM-0-13-ubuntu）当前发布目录为 `/opt/bnbu-sports-production/releases/login-admin-d34e3e38-20260914`。

- 学生端：https://www.student.bnbusports.cn/student/
- 教师/管理端：https://www.teacher.bnbusports.cn/
- 前一版本：`/opt/bnbu-sports-production/releases/semester-header-20260913`，完整保留。
- 后端镜像：`bnbu-backend-production:login-admin-d34e3e38-20260914`。
- 管理端镜像：`bnbu-portal-production:login-admin-d34e3e38-20260914`。

镜像 ID、上线检查与压缩包 SHA-256 见 `evidence/student-login-admin-20260914/deployment.json`。

## 来源及变更控制

发布前实测前后端均健康。逐文件核对后端三个变更模块及 OpenAPI 的线上字节摘要，与修复前基线一致；三个学生模块的差异仅为 CRLF/LF，按文本规范化比对全部一致。前一管理端发布的 server/index.js 与已留存发布包字节一致；留存构建目录的 app/public/包文件/构建配置与修复前源码比对无差异。

后端以线上 notification-history-20260913 镜像为基础，仅覆盖 ClientAuthenticationService、UsersService、StudentListQueryDto 的编译模块及附属类型/映射文件，以及 OpenAPI JSON。管理端以线上 semester-header-20260913 镜像为基础，替换来自本轮已验证源码的完整 dist，避免混留旧静态资源。学生端只替换 api.js、i18n.js、screens/verification.js。

复制前一发布目录，保留 production.env、compose.yml、nginx.conf 的原始字节；.env 仅切换 BACKEND_IMAGE 与 PORTAL_IMAGE。原镜像、配置、前一发布目录均保留。本次未运行数据库迁移、回填、数据清理、真实邮件发送或权限基础设施变更。此前线上其他修复通过继承现有镜像/发布目录保留。

仓库中的历史 Sites 配置未用于本次发布；本轮沿用用户当前腾讯云站点的既有发布架构。

## 上线检查

1. 校验全部 52 个包文件摘要，并比对本地上传包与服务器包 SHA-256 一致。
2. 两个候选镜像构建成功；后端三个变更模块在无网络容器中成功导入；管理端候选容器在无网络、只读、512 MiB 限制下健康。
3. 正式替换 backend/portal 后，两容器健康。
4. 学生页面、教师/管理页面、后端 readiness、既有 bnbusports.cn 分发站均返回 HTTP 200。
5. 三个公开学生模块逐个与发布包 SHA-256 一致。
6. 对不存在的随机验证码挑战请求执行线上负向检查，返回 401 AUTH_VERIFICATION_CODE_INVALID；未发码，也未创建学生账号或会话。
7. 浏览器打开正式学生邮箱登录页，确认新的入班说明与 student@mail.bnbu.edu.cn 示例可见；教师/管理端登录页正常。
8. 发布后再读 current 链接与运行容器，确认指向新版本且保持 healthy。

完整登录与管理端数据/权限业务回归证据来自本轮本地真实 PostgreSQL、HTTP、SMTP/Mailpit 和浏览器验收（详见同日期 handoff）。本次线上不宣称完成真实学校邮箱送达、全部业务写入或容量验收。发布时未触发回滚。

## 回滚

发布工具支持 `--prepare`、`--apply`、`--rollback`。应用发布失败自动切回前一目录并恢复前一镜像。需要回退本次发布时，在已确认香港主机上执行：

```bash
sudo python3 /home/ubuntu/bnbu-login-admin-20260914/deploy-student-login-admin.py --rollback
```

该命令要求 current 仍为本次或其前一版本；未来新版本上线后不能直接用本命令越级回滚。回滚只切应用与页面，因本次无迁移，无需数据库回退。回滚后应再验证健康和入口。

远程包及验证门禁：`/home/ubuntu/bnbu-login-admin-20260914`；本地包、准备/发布日志：`.local/login-deploy/`。密钥和生产运行配置未进入 Git。部署脚本与结果采用精确范围本地存档，不推送或合并。
