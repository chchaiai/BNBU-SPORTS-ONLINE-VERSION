# 历史学生资料规范与强制补录 · 2026-09-15

已部署至 https://www.student.bnbusports.cn/student/ 和教师/管理端。

## 行为

- 登录后按已有档案实时判断 NORMAL / REQUIRES_PROFILE_UPDATE / PENDING_REVIEW。明确格式异常必须补录；短姓名、疑似昵称只待核查。
- 复用原资料表单，预填姓名、学号、性别、入学年份、学院、专业、出生日期、地域。学院专业联动，保存前后均验证。强制页面没有取消入口。
- 后端禁止异常学生开始运动、创建历史补卡、创建打卡草稿或首次提交打卡；既有入班凭证也在最终入班重新校验。开始运动、历史补卡、提交与管理员标记使用组织锁防止并发绕过。
- 管理员学生列表支持状态筛选、异常原因、最近更新时间和补录时间；具有 USER_ACCOUNTS 权限的管理员可填写公开原因要求重新补录。教师无标记或修改权限。
- 复用 v81_events 记录标记和确认。保存前后资料、时间、操作者及原因留存，普通审计接口仍只展示安全元数据。邮箱、账号、成员关系及历史保留；重复学号拒绝，版本冲突与幂等重放受控。
- 使用实时评估代替批量改写，未执行数据库迁移。原档案内容只有本人提交后才变更。

## 验证

- 后端聚焦单元测试 12/12；学生 smoke 87/87；后端与管理端类型检查及构建通过。
- 本地真实 PostgreSQL + HTTP 8/8：异常打卡拦截、错误提交无修改、教师越权拒绝、幂等审计与邮箱/成员关系保留、补录后真实运动会话创建、管理员重新拦截与旧版本拒绝、重复学号拒绝、管理员列表状态。
- 390×844 浏览器真实 HTTP 保存通过：预填、无取消、非法学号提示、重选学院专业、补录完成回到首页；页面异常为零。
- 公网两个入口浏览器通过；后端与管理端健康，学生三文件、后端全部叠加文件和管理端公开资源 SHA256 核验通过。
- 16:30 左右只读扫描 BNBU 682 份档案：338 正常、344 必须补录、0 待核查。数值随新增及补录变化；其他组织的历史测试资料不计入此校内数字。
- 16:33:56 只读观察到 BNBU 2 名学生产生 2 次成功补录事件。本轮未修改真实学生资料作为测试。
- repo-layout:check 仍因已移除的 BNBU-Sports-Android-master 和旧 frontend/index.html 缺失而失败，未把它记为通过。手机浏览器尺寸验证不是物理手机验收。

## 发布与回退

当前：/opt/bnbu-sports-production/releases/profile-quality-20260915

前一版本：/opt/bnbu-sports-production/releases/student-email-domain-20260915

Backend：sha256:e0867da64f1eaa036a4843575cd9100ea290fae0a15006d81aa80e9c3e20e3ba

Portal：sha256:ff3e42944f7fc0d43993a1a660f6cd1755f59e4801bcab4966b3548dc4ff7c23

备份：/opt/bnbu-sports-production/backups/before-bugfix-20260915T083010Z.dump，17,591,696 字节，pg_restore 目录验证通过。

回退：先确认 current 仍是本次版本，再运行 sudo python3 /home/ubuntu/bnbu-profile-quality-20260915/deploy.py --rollback。回退应用不撤销已成功补录的学生资料。

准备阶段复用脚本时曾暂时覆盖旧 bug-20260915 镜像标签；在切换服务前已改用独立标签，恢复旧 Portal 镜像，并用原包重建旧 Backend 标签、核验其 19 个原发布文件。旧 Backend 重建镜像摘要为 sha256:95bf511cb0c56ffd9094d1bfeebe14d56f512da6a3578970acd9534687c55813。当前前一版本的镜像和回退配置已保留；本次未触发或演练服务回退。

证据：evidence/profile-quality-20260915/ 中的 deployment-result.json、postgres-http.log、production-scan.json、live-confirmations.json、public-browser.log、页面截图及 preparation-tag-recovery.json。bundle 为本次实际部署包，源码中的 OpenAPI 说明随后纠正了旧的“身份固定”描述；接口字段及运行行为与部署一致。本次未发布新的正式 Contract 版本。
