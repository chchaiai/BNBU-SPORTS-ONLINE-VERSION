# 剩余云端验收执行清单

状态：未完成。此文件由当前证据索引生成；已有成功接口仍可能缺页面、异常分支或完整链路证据。

快照：2026-09-13T03:25:21.236Z。尚无云端登记证据 7 个接口。

## 邮箱与账号恢复（4）

需真实邮箱收信及用户配合；测试初始化会话不代替邮件认证。

- [ ] `POST /auth/student-sign-in-codes` — requestStudentSignInCode
- [ ] `POST /auth/student-sign-in-codes/verify` — verifyStudentSignInCode
- [ ] `POST /auth/account-recovery-requests` — requestAccountRecovery
- [ ] `POST /auth/account-recovery-requests/complete` — completeAccountRecovery

## 分管理员治理（2）

用户已批准合成组织权限治理测试；八项权限矩阵、停用启用和删除通过。资料修改、重放、冲突和未验证邮箱拒绝已通过；邮箱挑战仍需实际收信验证。

- [ ] `POST /admin/subadmin-identity-challenges` — requestV81SubadminIdentity
- [ ] `POST /admin/subadmin-identity-challenges/{id}/verify` — verifyV81SubadminIdentity

## 帮助与兼容设备接口（1）

现行业务规则只要求站内通知，禁止业务系统 Push。公开帮助列表当前为空，详情成功路径没有可用文章；组织内 V8.1 帮助另有页面和接口证据。

- [ ] `GET /help-articles/{articleId}` — getHelpArticle

## 不随接口计数消失的验收要求

- [x] 邀请期限和固定十分钟宽限已获批准并部署；真实自然到期及教师输入框复测通过，固定截止已实际等待并确认拒绝，见 invite-natural-expiry.json。
- [ ] 学生 Web 邮箱认证已完成；Zeta 首页、规则同步、计时暂停及刷新恢复已验证。真实照片上传、提交、教师审核及正式记录详情已通过；用户已确认鸿蒙 Edge 本机视频播放恢复正常；仍需补齐其他网页业务流程。
- [x] 用户 2026-09-13 明确删除 Android/iOS 客户端及构建配置，官网入口同步下线；原生端全流程与 getAppReleasePolicy 不再属于当前交付验收。
- [ ] 教师、管理员页面的完整可操作回归，不能以 HTTP 测试替代。已补齐成绩保存发布、CSV/XLSX 上传确认、帮助草稿编辑发布下线、反馈受理完成关闭、未来学期编辑恢复；学期切换留到现有课程验收收尾。
- [x] OCR 两个上传入口的大文件限制已获批准并部署；约 2.2 MB 上传与原件回读、超限拒绝、其他路径保持原上限均通过。
- [x] UTC 上线后实际收尾补练、到期结算、纠错版本及导出已重新通过；补证维护计时及历史报告不变已重新通过。
- [ ] 技术故障状态夹具转人工、责任教师终审及审计已通过；真实待 AI 转交也已通过。未验证真实 AI 故障重试，现行业务文档规定 AI 自动审核为后续功能；该范围须在最终交接中明确。
- [x] 普通逐条审核待审记录成功与重放、批量成功失败混合结果与重放。
- [ ] 游泳到期边界已用历史时间夹具通过线上比较（非 30 分钟/24 小时实等），并修复提交失败部分提交缺陷；正常/真实延迟、续传、维护暂停及终审通过。旧合成异常记录待最终清理，剩余网页流程继续验收。
- [ ] 最终版本部署后全量回归、合成账号及 COS 材料清理、回滚验证和最终风险交接。

业务范围依据：docs/business/00-overview.md 第32行现仅保留Web；第113行仅站内通知、禁止业务短信邮件和系统Push。未运行外部Push不作为缺陷；站内通知仍须验证。

详细已完成证据、首错与恢复记录见 OCR-TRIPLATFORM-20260913.md。
