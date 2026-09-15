# 学生邮箱登录与管理端学生资料修复交接

后续状态：用户随后授权部署，香港站点已发布成功，详见 [发布记录](student-login-admin-20260914-deployment.md)。下文记录部署前的本地验收边界。

日期：2026-09-14。需求：根目录 bug.md；规则：docs/business 现行 V8.1 正文及本对话确认。

## 完成内容

- 后端先独立判断验证码有效性，再判断学生账号资格。正确验证码对应空 userId、未验证/已删除/不再可登录账号或已变更的邮箱时，返回账号未关联业务错误。错误、过期、锁定、已消费的验证码继续返回验证码错误。
- 验证阶段重新核对组织、学生角色、邮箱验证事实、账号状态、删除标记及邮箱摘要，避免旧邮箱挑战用于登录换绑后的账号。失败回执仍通过现有幂等事务保存；有效但没有账号的挑战被消费，且不会建立会话或自动绑定账号。
- 学生端中英文提示区分验证码问题和入班问题；未关联账号时清空已消费挑战和代码，停止重复提交。验证码错误提示不再要求“重新登录”。登录说明明确使用入班时已验证邮箱；示例为 student@mail.bnbu.edu.cn。
- 管理端列表展示学号、姓名、完整邮箱及验证事实、性别、入学年份、学院、专业、行政班、当前/历史课程关联、出生日期、地域、注册时间、账号状态。详情保留用户/组织标识、更新时间、版本等核查字段。
- 复用已有游标读取及前端分页，扩展关键词搜索邮箱、课程、出生日期和地域；支持状态、学院、入学年份、性别、课程/教学班、邮箱验证状态及注册日期区间组合筛选。关键词继续支持学号、姓名、专业、行政班。日期按浏览器本地日期与页面格式保持一致。
- 发现并修复状态映射：student_profiles.status 数据库约束只有 ACTIVE，不能用其判断退班；管理端列表、详情、状态筛选现依据 enrollment.status=ACTIVE 的关系是否存在，得到 ACTIVE/PENDING，不修改数据库约束。
- 用户已明确授权：具有 USER_ACCOUNTS 的分管理员也可在学生列表和详情查看完整邮箱。复用 requireAdminAccess 校验组织、活动账号、首次改密门禁和权限。教师列表不返回邮箱，也不能通过新增 email 参数探测邮箱。
- 学生删除入口继续按当前管理员身份核对 SUPER 资格；修正原页面权限 effect 的 lint 问题，避免切换身份沿用旧的删除权限展示。

## 接口与数据库

| 接口 | 变化 |
| --- | --- |
| POST /api/v1/auth/student-sign-in-codes | 保留统一 202 外观，不在发码阶段暴露账号是否存在 |
| POST /api/v1/auth/student-sign-in-codes/verify | 正确验证码但无可登录账号：404 USER_NOT_FOUND，details.resourceType=STUDENT_SIGN_IN_ACCOUNT；验证码失败仍为 401 AUTH_VERIFICATION_CODE_INVALID |
| GET /api/v1/students | 增加授权管理员 email/emailVerified，课程关联 courseAssociations；新增 collegeName/gender/gradeYear/email 查询参数，游标绑定全部新增筛选；status 限定 ACTIVE/PENDING 并依据入班关系筛选 |
| GET /api/v1/students/{studentId} | 授权管理员返回完整邮箱、验证事实及课程关联；管理端状态按有效入班关系计算 |

邮箱验证/日期/课程历史的页面组合筛选复用读取完整游标列表后的客户端过滤。现有接口 classSectionId 仍筛选 ACTIVE 入班关系；页面“含历史”课程筛选依据返回的全部 courseAssociations，两种口径有明确区别。courseAssociations 返回教学班 ID/代码/名称、课程名、学期名、关系状态，不直接序列化 User、Enrollment 或内部凭据。

所有资料来自既有 User、StudentProfile、Enrollment、ClassSection、Course、Semester 映射。注册时间采用 StudentProfile.createdAt。无新业务字段表、无数据库迁移、无数据回填。更新的是 3.0.0-v81-local-draft OpenAPI 与后端生成文件；未发布新正式 Contract，也未修改冻结客户端基线。

## 验证结果

- 独立 Docker Compose 项目 bnbu-login-regression，真实 PostgreSQL 18，应用全部现有迁移，编译后端后执行 HTTP e2e：17/17。
- 新回归覆盖：不存在/未验证邮箱、先错码再正确码、幂等重放、消费后重用、无新增会话、已入班/退班登录、过期挑战、发码后更换邮箱、授权分管理员完整邮箱、无权限拒绝、教师不披露邮箱、资料字段、组合筛选、空结果、非法参数、跨页无重复、游标筛选不匹配拒绝、退班状态映射。
- 验证码领域与接口绑定相关测试：25/25；学生端烟测：87/87（含新增中英文提示回归）。
- 后端 TypeScript、管理端完整 typecheck（含冻结基线校验）、变更文件 ESLint、后端与管理端构建通过。
- contract:parity:check：263 operations / 263 handlers，154 错误码对齐；openapi:check 通过。
- 真实浏览器 + 本地 SMTP/Mailpit：未知邮箱收码后分别验证错码/正确码提示；已验证退班账号进入学生首页；管理端 38 条合成资料加载、邮箱搜索、详情、性别/课程/验证事实组合筛选、退班筛选、空结果及重置通过。列表水平滚动布局已目视检查。
- 初次两次测试构造分别违反挑战时间约束和档案状态约束；调整过期测试时间后，并依真实入班关系修复业务状态映射，最终整组 17 项通过。未放宽数据库约束。

结构化证据：evidence/student-login-admin-20260914/validation.json；同目录保存最终 HTTP、单元/接口、学生烟测日志及 SHA-256。其他构建日志位于忽略目录 .local/login-*.log。不将账号密码、验证码或浏览器登录状态纳入存档。

## 本地复验

```powershell
npm --prefix backend run typecheck
npm --prefix backend run contract:parity:check
npm --prefix backend run openapi:check
node BNBU-Sports-Web-new/frontend/student/student-smoke.mjs
docker compose --env-file .local/v81-sql.env -p bnbu-login-regression -f tools/local-integration/compose.v81-full-integration.yml build integration-tests
docker compose --env-file .local/v81-sql.env -p bnbu-login-regression -f tools/local-integration/compose.v81-full-integration.yml run --rm integration-tests sh -ec 'npm run build && node node_modules/prisma/build/index.js migrate deploy && node --import tsx --test test/e2e/client-capabilities.e2e.test.ts'
```

测试重置仅发生于独立项目的 bnbu_sports_test 临时数据库。不要把测试重置命令指向其他数据库。.local/v81-sql.env 是已有本地测试环境文件，不应提交。

可用页面：学生 http://127.0.0.1:4274/student/；管理端 http://127.0.0.1:3300/；后端 http://127.0.0.1:3199/api/v1/health/ready；本地收件箱 http://127.0.0.1:18025。当前本地浏览器后端容器已载入本轮源文件并重启验证；重新创建容器时须从当前仓库重新构建，避免恢复旧镜像。测试用账号沿用忽略目录 .local/v81-browser-state 中的合成账号。独立回归项目容器已停止；本地浏览器后端和两个预览保持可用，交接前三个 HTTP 地址均返回 200。

## 风险与后续交接

- 已入班但未完成邮箱验证的账号仍需通过原入班/绑定流程完成验证；本轮不会凭未验证邮箱自动接管已有学号。丢失原绑定凭据的身份恢复仍按既有业务流程处理。
- 管理端沿用先读取全部游标页再本地筛选的基础能力。真实大规模资料和长期课程历史的数据量、响应时间未进行容量验收；需要时另行评估服务端分页筛选优化。
- 浏览器验证使用本地合成数据和 Mailpit。真实学校邮箱送达、线上环境、生产部署及负载能力不属于此次已通过证据。
- 管理端表格字段较多，通过横向滚动和详情查看；未执行手机硬件验收。
- 本次仅在当前分支精确范围本地提交。包含 bug.md 的用户需求修订；保留无关 tools/production/__pycache__/。不推送、不合并、不部署。
