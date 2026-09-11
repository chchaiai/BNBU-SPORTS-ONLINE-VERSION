# Stage 20A Unified Client Integration Contract Pack

状态：`ACCEPTED_FOR_ANDROID_WEB_PREPARATION`。`PROJECT_OWNER` 已于 2026-08-05 批准 INT-DEC-01–12；本包是 Stage 20B 的统一接入边界，不改变 OpenAPI，也不授权连接未知服务。staging 尚无真实 runtime 证据。

## 1. API authority

唯一机器合同是 `docs/backend-contracts/openapi.yaml`。ACCEPTED ADR/业务决策优先；客户端 DTO、Mock、旧 endpoint 和界面文案不能反向定义后端。

## 2. 环境矩阵与 Base URL

| 环境       | URL                       | 数据           | Mock                        | 状态                        |
| ---------- | ------------------------- | -------------- | --------------------------- | --------------------------- |
| local      | 显式 loopback `/api/v1`   | 合成           | development-only 可用且标识 | 可用                        |
| staging    | `PENDING_INFRA_SELECTION` | 仅合成 fixture | 禁止静默 fallback           | 建设已批准 / runtime 未就绪 |
| production | `USER_APPROVAL_REQUIRED`  | 正式数据       | 禁止                        | 未批准                      |

Android 使用 BuildConfig、Web 使用部署环境变量、iOS 未来使用 xcconfig。缺 production URL 必须 fail build/start；禁止写死 IP、源码 Secret、旧 API fallback。

## 3. Authentication flow

1. `password-login` 返回 Access/Refresh 和安全用户 projection。
2. Access 放 `Authorization: Bearer`；Refresh 只发 refresh endpoint。
3. Refresh 原子轮换；旧 token reuse 使 family revoke。
4. Logout 后清除本地凭证并使服务端 Session 不可继续刷新。
5. Android 用 Keystore-backed encrypted storage；未来 iOS 用 Keychain；Web 使用 Secure HttpOnly SameSite cookie 保存 refresh、内存保存 access，其 CORS/CSRF/cookie 传输细节必须通过 staging 安全验收。该客户端批准不接受 ADR-072 的 Production 参数。

## 4. Header 规范

- `Accept: application/json`；JSON mutation 使用正确 Content-Type。
- 客户端生成安全 `X-Request-ID` 可选；服务端返回最终 requestId。
- 所有要求幂等的 mutation 使用 `Idempotency-Key`。
- JoinCapability 只用合同指定 header，不能用 Access Token 代替。
- 不在 URL/query/log 放 Token、signed URL、storageKey 或 PII。

## 5. Request ID

客户端记录响应 `requestId`，问题报告只上传 requestId、operation、环境、客户端版本和错误码。不得把 requestId 当身份或幂等键。

## 6. Idempotency-Key

一个用户意图生成一个 key；重复点击、网络超时和明确重放复用同一 key。用户修改输入或明确重新发起才生成新 key。客户端不得自动无限重试 mutation。

## 7. expectedVersion

Mutation 使用服务端最近 projection 的 `expectedVersion`；Review 同时使用 `expectedReviewVersion`。版本冲突后刷新、显示变化并要求用户重新确认，不能盲重放旧请求。

## 8. Cursor pagination

cursor 是 opaque 且绑定主体/角色/组织/filter/sort/limit。客户端只原样回传，不解析、不跨账号缓存、不改变 filter 后复用。

## 9. Error envelope

所有非 2xx 业务响应按 `code/message/details/requestId/timestamp`。业务逻辑只按 `code` 分支；message 只作 fallback。未知 code 按 HTTP 类安全失败并展示 requestId。

## 10. Enum

只接受 OpenAPI UPPER_SNAKE_CASE 值；UI 通过本地 i18n 映射。未知 required enum fail closed，不能映射成成功或 `OTHER`。

## 11. 日期时间

时间点为 RFC3339，businessDate 为 date-only。客户端可本地化显示但不能改写事实；组织时区和服务端 startedAt 决定 businessDate。

## 12. Decimal

Score Decimal 按字符串/decimal-safe 类型处理，不能用二进制浮点重新计算正式成绩。显示精度服从 projection，客户端不产生 finalScore。

## 13. Media upload

严格顺序：initiate→private PUT→confirm→bind→processing→AVAILABLE。mediaId 是稳定身份；URL 短期且不可持久展示，storageKey 永不进入业务 projection。失败按状态查询和允许的 retry 恢复。

## 14. Session lifecycle

启动前检查 active Session；服务端裁决 start/pause/resume/reconcile/finish/cancel/expire 和 7200 秒上限。App restart 恢复服务端 active；客户端时间只用于即时 UI，reconcile 无可信证据时 fail closed。

## 15. Record lifecycle

只有 COMPLETED Session 才能创建 Record；DRAFT 可编辑/丢弃，submit 冻结媒体并创建初始 PENDING Review。credited duration 只来自服务端 Session 秒数；withdraw 当前 exact default-deny。

## 16. Review lifecycle

责任 TEACHER 追加 VALID/INVALID，reopen 追加 PENDING；不覆盖历史。每次使用 Record/Review 双 version。STUDENT 只见 safe currentReview，永不见 `internalNote`。

## 17. Score projection

客户端不计算正式分。学生只见批准 projection；working 与 published 分离。Review 变化产生新 working revision但不覆盖旧 published；归档 correction 当前 default-deny。

## 18. Export current state

`listExports/createExport/getExport/createExportDownloadUrl` 当前均为 `SYSTEM_MODE_UNSUPPORTED`。客户端不得返回本地假文件、假任务或空数组；只显示“尚未开放”并保留 requestId。

## 19. Audit

仅同组织 ADMIN 可 list/get；TEACHER/STUDENT 禁止。metadata 已服务端脱敏，客户端仍不得日志化整个对象。读取 Audit 本身会审计。

## 20. Mock policy

- 领域 Mock 只允许 automated test 或显式 development-only 入口。
- production build 必须证明 Mock adapter/seed/本地业务真相不可达。
- 网络失败、404、503 或未知 code 都不得自动切 Mock。
- Android Mock 用户、Web admin/roster Mock 必须与真实 Session/Token/storage namespace 隔离。

## 21. Generated client policy

生成 DTO/schema 来自同一 OpenAPI commit/hash；transport、secure storage、retry 和 UI adapter 手写并测试。生成物不可手工改字段；升级需 compatibility diff 和 release note。

## 22. Logging 与 PII

客户端日志禁止 Token、Authorization、Cookie、密码、完整学号/邮箱/手机号、storageKey、signed URL、媒体正文和完整 error body。必要身份字段只显示最小掩码；production 禁 debug network body logging。

## 23. Contract compatibility tests

每端至少覆盖：operation path/method、required header、envelope、enum、error code、cursor opaque、idempotency replay、version conflict、role projection、Media URL/storageKey 禁止、Export 503 和 Audit role denial。测试绑定 OpenAPI hash。

## 24. Staging smoke list

1. Health/readiness/SystemMode；2. 三角色登录、refresh reuse、logout；3. Course/ClassSection/Enrollment；4. Android Session/Media/Record；5. Web Review；6. Score recalc/publish/read；7. Export 503；8. ADMIN Audit read；9. requestId 端到端；10. CORS/TLS/Secret/log scan；11. restart；12. teardown/reset synthetic fixtures。

## 25. 问题报告模板

记录环境、客户端/OS/build、OpenAPI hash、operationId、时间、requestId、HTTP status、error code、复现步骤、预期/实际；附件先脱敏。不得附 Token、密码、真实学生数据或 signed URL。

## 26. 模块联调顺序

推荐按模块纵向：Auth→Teaching/Enrollment→Session/Media/Record→Review→Score。每模块先验证产生事实的一端，再验证消费事实的一端；iOS 工程不存在，不能计入完成。

## 27. Definition of Done

- INT-DEC-01–12 已有明确批准证据；staging、合成账号和 reset 可用。
- 使用同一 OpenAPI hash，compatibility tests 和模块 smoke 全通过。
- production build 无 Mock/旧 API fallback；真实 requestId 可跨端追踪。
- Auth、Idempotency、version、cursor、error、role projection 和 private Media 均通过负面测试。
- Android/Web 各自工作树 clean、提交可追溯；iOS 只有工程与同等测试存在后才能计入。
- Export/Production 未批准项继续明确为 NO，不因客户端页面存在而提升 Gate。

当前结论：`CLIENT_INTEGRATION_CONTRACT_GATE=YES`，`CLIENT_INTEGRATION_APPROVAL_GATE=YES`，`CLIENT_INTEGRATION_PREPARATION_READINESS=YES`，`STAGING_RUNTIME_READINESS=NO`，`CLIENT_INTEGRATION_GATE=NO`。最后一个 NO 表示尚未完成真实跨端联调，不撤销已批准的准备工作。
