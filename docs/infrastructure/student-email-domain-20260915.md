# 学生邮箱完整后缀修复 · 2026-09-15

已部署至 https://www.student.bnbusports.cn/student/ 。

## 规则与修复

学生输入的邮箱必须以完整 `@mail.bnbu.edu.cn` 结尾；忽略大小写，去除首尾空格。原先部分入口仅检查包含 `bnbu`，普通登录仅检查通用邮箱格式，导致缺少 `.cn` 或使用错误域名仍可提交。

- 学生网页登录、入班、绑定及修改邮箱使用统一校验，并明确提示所需后缀。
- 后端学生发码接口在数据库查询、额度预留及邮件发送前校验，不合法时返回 `422 VALIDATION_FAILED / BNBU_EMAIL_REQUIRED`。
- 入班邮箱证明、入班凭证及正式入班再次校验后缀；绑定/修改邮箱的确认步骤拒绝旧挑战中的非法目标地址。
- 已有账号和邮箱记录没有批量改写。输入错误地址需要本人更正；没有自动猜测或补写邮箱。

## 验证

- 后端针对性单元测试 4/4；前端针对性测试 4/4；学生 smoke 87/87。
- TypeScript typecheck、Nest build、本次路径 `git diff --check` 通过。
- 本地真实 PostgreSQL + SMTP Mailpit：3/3。覆盖完整邮箱验证到正式入班、再次入班、错误后缀零挑战/零额度、正确后缀及大小写空格归一、幂等重放、防刷及无效邀请。
- 生产：8 次错误后缀请求全部返回 422；学生站、教师站、官网及 readiness 返回 200；5 个前端文件和 10 个后端编译文件 SHA256 匹配发布包。
- 生产探测只提交非法域名，未发送真实学生测试邮件。真实邮箱收件与 Android 实机未在本次验证。

本地测试曾因 TypeScript 可选属性传入 undefined 报错，修正测试参数后 typecheck 通过。另有构建工作目录和 Python 控制台编码错误，均未涉及生产切换；真实数据库测试结果已保存在日志并核实 3/3 通过。

## 发布与回滚

- 当前目录：`/opt/bnbu-sports-production/releases/student-email-domain-20260915`
- 上一目录：`/opt/bnbu-sports-production/releases/aoksend-mail-20260915`
- 镜像：`sha256:f67f7a5d177424d0bbd3dde8aac15bea90452e5c90e949b7c98a3a124e5a1e4c`
- 基于当前线上镜像仅叠加本次模块；四个后端模块修改前哈希与线上一致。binding.js 修改前仅换行形式存在差异，内容逐行一致。
- 继承当前邮件提供商与配置；未执行数据库迁移。失败自动回滚已配置，本次未触发或演练回滚。
- 手动回滚：`sudo python3 /home/ubuntu/bnbu-student-email-domain-20260915/deploy.py --rollback`。
- 证据：`evidence/student-email-domain-20260915/deployment-result.json`、`postgres-http.log`、`validation.json`、`bundle/validation.json`。
- `task-source.diff` 对照本次开始时的源码快照，便于区分已有并行修改。未执行 Git 提交或推送。
