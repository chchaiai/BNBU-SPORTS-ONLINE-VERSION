# 教师级联删除及登录密码按钮修复

## 业务范围

用户确认取消教学结束、课程关闭和收尾结算前置限制；删除教师时关闭其全部未关闭课程，彻底删除这些课程当前 ACTIVE 学生的账号及全部业务数据，包括其他教师课程中的关系和历史。历史上已移出、仅保留旧关系的学生不因该旧关系成为新的账号删除目标。其他课程本身及无关学生保留。管理员仍需同组织 USER_ACCOUNTS 权限、NORMAL 模式、有效版本、工号确认和非空原因。

新增 confirmStudentErasure=true 协议字段，避免旧缓存页面在没有显示扩大后的删除范围时发起级联删除。数据库保持 61 个迁移；复用已有学生清理函数及 COS 持久清理队列。批处理每个学生使用独立临时行计划，事务最多 120 秒；失败整体回滚。客户端按原幂等键核对丢失回执。审计不再错误标注 teachingCompleted=true，记录真实关闭课程数量和删除学生数量。

## 密码按钮根因

登录页已有一个自定义按钮，Edge 还会为密码框加入浏览器原生按钮。仅为登录框设置 `::-ms-reveal { display: none; }`，保留原按钮及显示/隐藏功能。采用 [Microsoft 官方方法](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/password-reveal)。原生伪元素的 getComputedStyle 不作为验收依据；验证发布 CSS、按钮交互并检查截图。

## 本地回归

- 独立 Docker PostgreSQL / HTTP / Edge 浏览器：3 名学生、其中一名具有其他教师历史课程关系；教师课程 ACTIVE，未完成结算。
- 无权限教师 403、错误工号 422、缺少明确清除确认 422、旧版本 409。
- 给最后一名学生添加测试外键阻止删除，真实 HTTP 500 后教师及 3 名学生全部保留，课程仍 ACTIVE；移除测试约束后执行正常删除。
- 删除成功响应故意丢失，相同幂等键重试成功；刷新教师消失、旧教师会话 401、学生查询 404、无关学生查询 200。
- 数据库验证 2 门课程 CLOSED/ARCHIVED，学生全部关系清零、其他教师课程 ACTIVE、无关学生在班、教师删除审计 1 条。隔离测试账号完成后停用。
- Edge 登录框仅有一个页面按钮，显示与隐藏可切换，已检查截图。后端及门户 TypeScript、改动文件 ESLint、Linux Portal 构建通过。
- 本次级联样本验证账号、跨课程关系和批量事务；复杂打卡、审核、学时、报告以及真实 COS 对象清理复用已验收的学生删除能力，证据见 STUDENT-DELETION-20260911.md，不把空记录样本称为再次完成媒体全链测试。

## 部署和线上验收

- 源码提交 `c33f037b712950ec94786fe0deac3430b6819546`；发布目录 `/opt/bnbu-sports-production/releases/c33f037b-teacher-cascade`。
- Backend `sha256:91012a8df3441372fcfd38a39e8a4a0450fd8a512a6e1fbb5688e955e2aea8ba`；Portal `sha256:ff9056263aed40e15e8b87bcc0063073b97d1176d17f9f204731f5f1cc5b5e9e`。两个服务 healthy，公开健康接口和门户 HTTP 200。Migrator 及数据库结构未变。
- 部署前数据库备份 `/opt/bnbu-sports-production/backups/before-bugfix-20260911T114548Z.dump`，3,439,902 字节。
- 独立腾讯云测试组织的真实网页执行 PASS：取消前置限制后直接删除，丢失首次成功响应后的同键重试通过；刷新教师消失，旧会话 401，3 名学生 404，无关学生 200。
- 真实腾讯云数据库验证 PASS：教师及账号、3 名学生及所有课程关系归零，2 门所属课程 CLOSED/ARCHIVED，其他教师课程 ACTIVE，无关学生仍在班，删除审计 1 条。
- 云端 Edge 登录按钮交互、发布样式和截图检查通过，仅一个可见密码显示按钮。
- 已停用剩余 4 个隔离测试账号并增加 tokenVersion。未操作真实学校师生账号。
- 应用回退使用 `/opt/bnbu-sports-production/releases/e4bd83eb4b5f-student-delete` 的固定 Backend/Portal 镜像并原子切回 current；应用回退不会恢复已删除数据。恢复备份须单独决定，避免覆盖后续真实业务。
- 证据目录 `docs/implementation/evidence/teacher-cascade-20260911/`。较早的手机视频兼容与学生待审核记录可见性改动仍在工作区继续处理，本次仅部署教师级联删除及管理端密码框修复。
