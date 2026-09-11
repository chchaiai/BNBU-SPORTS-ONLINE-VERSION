# 三端业务主流程逐项审计

2026-09-09。本表逐字保留现行业务文档三段主流程的全部30个编号要求。LOCAL_EVIDENCE仅表示已有所列本地证据，不表示该条所有异常和边界全覆盖；PARTIAL_WEB为网页证据不足；AUTHORIZED_IMPLEMENTATION_PENDING为已获批准但未实施的页面缺口；USER_DEFERRED_WEB为用户暂缓的网页范围；SCOPED_DEPENDENCY按用户排除或真实云端依赖处理。

| 角色/序号 | 原始要求 | 当前证据与判断 |
|---|---|---|
| 学生 1 | 通过有效邀请注册或登录并直接入班，验证学校邮箱。 | LOCAL_EVIDENCE：已发布开放课程下的新学生邀请入班、首次真实邮件验证、刷新和教师名单网页回读通过；新建课程发布阻断单独保留。 [JOIN-E2E-CURRENT-20260908.md](JOIN-E2E-CURRENT-20260908.md)、[STUDENT-BROWSER-20260908.md](STUDENT-BROWSER-20260908.md)、[NEW-STUDENT-JOIN-FINDING-20260909.md](NEW-STUDENT-JOIN-FINDING-20260909.md)、[NEW-STUDENT-REGISTRATION-WEB-20260909.md](NEW-STUDENT-REGISTRATION-WEB-20260909.md) |
| 学生 2 | 查看课程模板、两类目标、截止日和本人名单核对结果。 | LOCAL_EVIDENCE：课程规则及本人名单页面已有验证。 [STUDENT-COURSE-OWN-INFO](STUDENT-COURSE-OWN-INFO-20260909.md)、[STUDENT-OWN-ROSTER-WIRED](STUDENT-OWN-ROSTER-WIRED-20260909.md) |
| 学生 3 | 在允许时间开始独立运动，需要时暂停，结束后保留准确会话事实。 | LOCAL_EVIDENCE：真实计时、原会话恢复、暂停继续及结束。 [REAL-CREDIT-RECOVERY](REAL-CREDIT-RECOVERY-20260908.md) |
| 学生 4 | 选择类别、填写说明并提交凭证；游泳遵守前后照片和限时受理规则。 | USER_DEFERRED_WEB：普通相机提交通过；游泳仅有API方法，页面没有阶段或延迟说明。 用户已明确暂缓该网页功能，保留后端，不作为本轮网页完成阻断。 [STUDENT-CAMERA-CLOSURE](STUDENT-CAMERA-CLOSURE-20260908.md)、[SWIM-INTAKE-E2E](SWIM-INTAKE-E2E-20260908.md) |
| 学生 5 | 查看 AI 处理结果；正常自动有效，异常等待教师，技术故障不受罚。 | SCOPED_DEPENDENCY：用户先验人工审核；AI自动通过依赖真实样本验证。 [MANUAL-MAINLINE](MANUAL-MAINLINE-20260908.md) |
| 学生 6 | 如被退回，在教师指定的 24/72 小时有效计时内提交一次补证；维护暂停、恢复后续计。正式受理后进入新的教师两工作日复核轮次，补证后判无效不再补证。 | LOCAL_EVIDENCE：一次补证与维护范围已有证据；学校日历/SLA按用户排除。 [SUPPLEMENT-BROWSER-CLOSURE](SUPPLEMENT-BROWSER-CLOSURE-20260908.md)、[MAINTENANCE-PENDING-BROWSER](MAINTENANCE-PENDING-BROWSER-20260909.md) |
| 学生 7 | 查看系统自动计算的可计/实际计入分钟、分类进度和剩余目标。 | LOCAL_EVIDENCE：35分钟正计入及认可调整回读；组合算法由后端测试补充。 [REAL-CREDIT-RECOVERY](REAL-CREDIT-RECOVERY-20260908.md)、[RECOGNITION-ADJUSTMENT](RECOGNITION-ADJUSTMENT-20260909.md) |
| 学生 8 | 无效后可重新实际运动，日/周上限仍有效；达标后可继续记录运动。 | LOCAL_EVIDENCE：真实网页无效后新会话拍照提交、教师通过及双历史保留；日周及达标继续运动由既有后端证据覆盖。 [SESSION-E2E-CURRENT-20260908.md](SESSION-E2E-CURRENT-20260908.md)、[INVALID-REPEAT-WEB-20260909.md](INVALID-REPEAT-WEB-20260909.md) |
| 学生 9 | 查看教师确认的原始体测数据，按需要提交免测或组织认证。 | LOCAL_EVIDENCE：申请实际上传和体测读取已有证据。 [APPLICATION-REAL-UPLOAD](APPLICATION-REAL-UPLOAD-20260909.md)、[OCR-WEB](OCR-WEB-20260909.md) |
| 学生 10 | 接收期末提醒；如获准，在七天收尾期的指定窗口补练。 | LOCAL_EVIDENCE：实际窗口补练分段网页与数据库回读通过；后台实际生成截止提醒、学生网页读取及已读回读通过。 [LIVE-REMINDER-WEB](LIVE-REMINDER-WEB-20260909.md) [MAKEUP-DEADLINE-FIX](MAKEUP-DEADLINE-FIX-20260909.md) [MAKEUP-WINDOW-BROWSER](MAKEUP-WINDOW-BROWSER-20260909.md) |
| 学生 11 | 查看本人结算数据和更正结果；分数由学校指定渠道反馈。 | USER_DEFERRED_WEB：后端本人结算接口存在；当前学生JS没有调用。 用户已明确暂缓该网页功能，保留后端，不作为本轮网页完成阻断。 [STUDENT-SETTLEMENT](STUDENT-SETTLEMENT-20260908.md) |
| 教师 1 | 首次登录完成本人改密；使用有效教师身份进入工作台。 | LOCAL_EVIDENCE：首次改密网页已补齐。 [TEACHER-FIRST-PASSWORD](TEACHER-FIRST-PASSWORD-20260909.md) |
| 教师 2 | 开课选择已发布模板、两类目标、日期和七天收尾安排，校验后发布锁定。 | LOCAL_EVIDENCE：用户授权后，新建课程自选两类目标、45分钟门槛和每周4次，发布锁定、邀请入班及数据库回读通过。 [COURSE-PARAMETERS-WEB](COURSE-PARAMETERS-WEB-20260909.md) [TEACHER-BROWSER](TEACHER-BROWSER-20260908.md)、[NEW-STUDENT-JOIN-FINDING](NEW-STUDENT-JOIN-FINDING-20260909.md) |
| 教师 3 | 生成默认 30 分钟有效的邀请，学生按统一规则直接加入。 | LOCAL_EVIDENCE：生成/撤销及失效检查已实测；新学生网页入班仍单列。 [INVITE-REVOCATION](INVITE-REVOCATION-20260908.md) |
| 教师 4 | 导入电子/纸质名单，核对识别草稿，系统自动匹配，教师仅处理差异。 | LOCAL_EVIDENCE：电子/纸质确认与关闭后续办已验证；网页多页边界不由单页测试证明。 [OCR-WEB](OCR-WEB-20260909.md)、[ELECTRONIC-ROSTER-CLOSED](ELECTRONIC-ROSTER-CLOSED-20260909.md) |
| 教师 5 | 正常凭证 AI 自动通过；教师在异常队列执行通过、退回补证或判为无效，按适用动作选择固定公开原因。 | LOCAL_EVIDENCE：手工审核主流程符合用户决定。 [STUDENT-CAMERA-CLOSURE](STUDENT-CAMERA-CLOSURE-20260908.md)、[SUPPLEMENT-BROWSER-CLOSURE](SUPPLEMENT-BROWSER-CLOSURE-20260908.md) |
| 教师 6 | 退回结束本轮教师 SLA，学生开始 24/72 小时补证计时；正式受理后开启新的教师两工作日 SLA。维护暂停后续计，补证后判无效不再退回，真实逾期未交由系统终结。 | LOCAL_EVIDENCE：补证只一次，教师轮次事实保留；学校工作日日历排除。 [SUPPLEMENT-BROWSER-CLOSURE](SUPPLEMENT-BROWSER-CLOSURE-20260908.md)、[MAINTENANCE-PENDING-BROWSER](MAINTENANCE-PENDING-BROWSER-20260909.md) |
| 教师 7 | 核对体测 OCR 数据并确认；按既有边界处理免测与组织认证。 | LOCAL_EVIDENCE：原图核对、体测与申请批准已有验证。 [OCR-WEB](OCR-WEB-20260909.md)、[APPLICATION-REAL-UPLOAD](APPLICATION-REAL-UPLOAD-20260909.md) |
| 教师 8 | 系统计算最优合规计入组合与进度，教师不手工分配名额。 | LOCAL_EVIDENCE：后端计算和真实正计入证据并存。 [REAL-CREDIT-RECOVERY](REAL-CREDIT-RECOVERY-20260908.md)、[MANUAL-PROGRESS-E2E](MANUAL-PROGRESS-E2E-20260908.md) |
| 教师 9 | 常规截止前接收提醒，在七天收尾期开放指定补练并完成待办。 | LOCAL_EVIDENCE：实际提醒由后台生成，教师通知打开准确课程；窗口内运动及撤销后续办已有分段网页证据。 [LIVE-REMINDER-WEB](LIVE-REMINDER-WEB-20260909.md)、[MAKEUP-DEADLINE-FIX](MAKEUP-DEADLINE-FIX-20260909.md) [MAKEUP-WINDOW-BROWSER](MAKEUP-WINDOW-BROWSER-20260909.md)、[NOTIFICATION-SOURCE-AUDIT](NOTIFICATION-SOURCE-AUDIT-20260909.md) |
| 教师 10 | 确认综合名单和考核结算，后续更正另留版本；课程可先关闭以禁止新业务起点，关闭前合法业务仍须处理完，全部收尾结算完成后才允许学期切换归档。 | LOCAL_EVIDENCE：结算、归档、更正与旧报告保留网页闭环。 [SETTLEMENT-BROWSER](SETTLEMENT-BROWSER-20260909.md)、[SEMESTER-NONEMPTY-WEB-CLOSURE](SEMESTER-NONEMPTY-WEB-CLOSURE-20260909.md)、[RECOGNITION-SETTLEMENT-WEB](RECOGNITION-SETTLEMENT-WEB-20260909.md) |
| 管理员 1 | 总管理员及分管理员完成首次临时密码修改，按权限进入业务。 | LOCAL_EVIDENCE：账号和恢复已有证据，不把教师首登证据替代所有管理员首登。 [TEACHER-FIRST-PASSWORD](TEACHER-FIRST-PASSWORD-20260909.md)、[SUBADMIN-CURRENT](SUBADMIN-CURRENT-20260909.md)、[PASSWORD-RECOVERY-BROWSER](PASSWORD-RECOVERY-BROWSER-20260909.md) |
| 管理员 2 | 创建教师账号、准备学期和已确认模板；责任教师创建并发布课程规则。 | LOCAL_EVIDENCE：建号、学期及统一模板发布均有网页证据，模板刷新幂等重试通过。 [TEACHER-IMPORT-RETRY-BROWSER](TEACHER-IMPORT-RETRY-BROWSER-20260909.md)、[RULE-TEMPLATE-E2E](RULE-TEMPLATE-E2E-20260908.md)、[ADMIN-REVIEW-SERVICES-WEB](ADMIN-REVIEW-SERVICES-WEB-20260909.md) |
| 管理员 3 | 查看名单核对、登记完成与打卡进度的课程汇总，不代改学生身份。 | LOCAL_EVIDENCE：只读汇总及健康刷新已有验证。 [COURSE-DIRECTORY-BROWSER](COURSE-DIRECTORY-BROWSER-20260909.md)、[ADMIN-HEALTH-BROWSER](ADMIN-HEALTH-BROWSER-20260909.md) |
| 管理员 4 | 总管理员配置并验证 AI/OCR 服务，正常材料自动初审，异常交教师。 | SCOPED_DEPENDENCY：OCR治理网页配置和启停已验证；真实腾讯云连通性及AI自动通过样本验证仍为依赖。 [OCR-GOVERNANCE-E2E](OCR-GOVERNANCE-E2E-20260908.md)、[ADMIN-REVIEW-SERVICES-WEB](ADMIN-REVIEW-SERVICES-WEB-20260909.md) |
| 管理员 5 | 区分技术故障和教学待办，必要时启用有范围的人工模式并通知教师。 | LOCAL_EVIDENCE：人工模式按课程及理由从网页启停、刷新重试和恢复通过。 [MANUAL-MAINLINE](MANUAL-MAINLINE-20260908.md)、[ADMIN-REVIEW-SERVICES-WEB](ADMIN-REVIEW-SERVICES-WEB-20260909.md) |
| 管理员 6 | 责任教师完成本学期教学及课程收尾结算；不设置学期中删除责任教师、删除后接管或责任转移流程。 | SCOPED_DEPENDENCY：责任教师继续收尾；教师删除按用户暂缓，保留历史职责。 [SETTLEMENT-BROWSER](SETTLEMENT-BROWSER-20260909.md) |
| 管理员 7 | 按原权限处理反馈、帮助、换算表、维护和审计，学生分数不得从这些入口泄漏。 | LOCAL_EVIDENCE：分别已有业务证据，需按专项范围阅读。 [HELP-CURRENT-BROWSER](HELP-CURRENT-BROWSER-20260909.md)、[FEEDBACK-BROWSER-CLOSURE](FEEDBACK-BROWSER-CLOSURE-20260908.md)、[ENDURANCE-CREATE-DELETE-BROWSER](ENDURANCE-CREATE-DELETE-BROWSER-20260909.md)、[AUDIT-UNIFIED-BROWSER](AUDIT-UNIFIED-BROWSER-20260909.md)、[RUNTIME-ARCHIVE-REFRESH](RUNTIME-ARCHIVE-REFRESH-20260909.md) |
| 管理员 8 | 查看期末提醒、收尾和结算阻塞，完成旧学期结算后才切换归档。 | LOCAL_EVIDENCE：非空旧学期未结算阻断、结算后切换、归档回读。 [SEMESTER-NONEMPTY-WEB-CLOSURE](SEMESTER-NONEMPTY-WEB-CLOSURE-20260909.md) |
| 管理员 9 | 归档后确需修正旧事实时，由有权限教师追加纠错及新版报告；管理员保留治理与审计职责。 | LOCAL_EVIDENCE：教师旧事实更正并追加报告，管理员不代审。 [RECOGNITION-SETTLEMENT-WEB](RECOGNITION-SETTLEMENT-WEB-20260909.md)、[SEMESTER-NONEMPTY-WEB-CLOSURE](SEMESTER-NONEMPTY-WEB-CLOSURE-20260909.md) |

## 本轮实际重新核对的缺口

- 管理员app下所有TSX/TS实际调用未找到rule-templates管理、manual-mode或OCR治理；教师模板读取不等于总管理员可发布。run-v81-browser-backend.mjs通过API准备模板/人工模式，因此此前业务测试存在后台配置前提。用户批准后已实现并经真实网页验证，见 ADMIN-REVIEW-SERVICES-WEB-20260909.md。
- 学生api.js导出acceptSwimIntake/getSwimIntake方法，但checkin.js没有调用或泳前/泳后材料标记、延迟说明；普通相机成功不能证明游泳。用户已决定暂缓该网页功能，保留后台接口。
- 当前学生JS没有settlement-result调用；STUDENT-SETTLEMENT是HTTP接口证据。用户已决定暂缓该网页功能，保留后台接口。
- 用户决定后的范围：三项管理员页面已实现并验证；两项学生网页暂缓，不再作为本轮阻断。

## 主流程以外章节仍保留

学生邮箱换绑、偏好、通知、帮助反馈和退出；教师成员移出/恢复及班级迁移边界；管理员分管理员身份/权限/删除、学期创建编辑、账号只读、换算表、维护公告/历史、帮助发布/下线、反馈与审计ZIP均仍在原任务范围。部分已各自验证，后续以同名专项和原始日志形成最终交接，不删除这些要求。

## 工程检查现状

- 59迁移安全检查和迁移manifest通过，旧前20迁移限制已解决。
- OpenAPI生成检查发现本地两份JSON少了当前两个404响应；重新生成后通过。Docker构建每次自动生成，最新101/101运行证据仍有效。
- generate:check被monorepo布局阻断：本工作区缺Android目录和旧frontend/index.html。未伪造文件或放宽原门禁；本用户任务为网页三端。
- 发布政策与compatibility命令要求2.0.12-contract，当前为3.0.0-v81-local-draft，原发布检查继续失败。新增差异审计使用Git HEAD中的已发布2.0.12快照，严格校验原SHA；工作树CRLF换行导致初次摘要失败，未修改历史快照。
- 实际差异：53 BREAKING、27 NON_BREAKING、35 REVIEW_REQUIRED，见[机器报告](local-candidate-compatibility-audit-20260909.json)。这是差异清单，不是发布批准或兼容性通过。不得把此候选直接作为旧客户端的兼容升级。

下一步：在已批准范围完成尚缺网页链的测试；三项管理员表单已完成。补练截止修复及第 41 次完整 Docker 101/101 见 MAKEUP-DEADLINE-FIX-20260909.md。正式云服务仍留真实接入依赖，学校日历和学生注销/教师删除遵守用户已确认决定。
