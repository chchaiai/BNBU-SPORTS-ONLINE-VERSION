# Stage 15 — MediaEvidence Core 实现与运行验收报告

日期：2026-08-04
分支：`backend/media-evidence`
Stage 14 基线：`dd9a4084faec7780c2464deb64233fbc1ee5b647`
最终 Stage 15 HEAD：以本报告所在最终本地提交后的 `git rev-parse HEAD` 为准。

## 1. 提交与范围

本阶段提交（最终文档提交的完整 hash 以 Git 为准）：

- `bcb4aa2` `docs(backend): freeze stage 15 media boundary`
- `98c4296` `fix(backend): close media contract ambiguities`
- `da2d69e` `feat(backend): add media evidence persistence`
- `9c89d9e` `feat(backend): implement private media evidence core`
- `e0bc9eb` `test(backend): verify media evidence lifecycle`
- `docs(backend): close stage 15 media evidence gate`

只实现 MediaEvidence Core。没有创建 ExerciseRecord、Review、Score 或 Export 表/Controller，没有修改 Android/Web，也没有批准 production 参数。

## 2. 合同与运行覆盖

唯一机器合同仍是 `openapi.yaml`，共 88 个 operation。Stage 15 的五个真实 operation：

- `initiateMediaUpload`
- `confirmMediaUpload`
- `getMediaEvidence`
- `bindMediaEvidence`
- `createMediaAccessUrl`

运行覆盖为 53 `IMPLEMENTED_VERIFIED`、2 `IMPLEMENTED_DEFAULT_DENY`、28 `NOT_IMPLEMENTED`、5 `BLOCKED_BY_ADR`。默认拒绝仍只有 `withdrawEnrollment` 与 `ignoreRosterAlignmentResult`。

Initiate 原子分配稳定 `mediaId` 和独立 `uploadSessionId`；confirm 沿用原 `mediaId`。Stage 15 bind 只接受既有同一 `ExerciseSession` 和 `expectedVersion`，不接受任意 `recordId`。公共 projection 的 `recordId` 固定为 `null`，ExerciseRecord 关联留给 Stage 16。

## 3. Migration 0006

`0006_media_evidence` SHA-256：`81fb6be00696084be87248445941909e04dfb130aff448585d602caa4c73cf31`。

新增：

- `media_evidence`
- `media_upload_sessions`
- `media_status_events`
- `media_processing_attempts`

受版本控制 SQL 的确定性统计：4 表、10 FK、7 unique index、25 CHECK additions、13 total indexes、5 user triggers。触发器保护身份/声明/已验证事实、单调状态、append-only history，并以事务 advisory lock 强制同 Session 活跃媒体上限（IMAGE 6、VIDEO 1）。0001–0005 checksum 未变化。

## 4. 事实、状态与事务

客户端声明与服务端验证事实分别保存：MIME、文件字节数、SHA-256、视频时长。ETag 仅作对象确认参考，绝不作为 SHA-256。服务端流式读取对象字节并计算 hash，检查 PNG/JPEG 与 MP4/MOV/3GP/WebM 真实容器、图片尺寸、视频轨、音轨、视频时长、损坏内容、测试扫描签名和位置元数据；失败时不写入伪造的 verified facts。Contract 1.5 增量明确：视频真实时长必须在 `(0, 15]` 秒且同时具有画面和声音；位置元数据返回 `MEDIA_LOCATION_METADATA_NOT_ALLOWED`，不会要求客户端申请定位权限，也不会被提取为 GPS 业务事实。

状态机为 `PENDING_UPLOAD → UPLOADED → BOUND → PROCESSING → AVAILABLE`，完整失败路径进入 `FAILED`；`DELETED` 仅为冻结枚举，Stage 15 无删除/解绑/重绑 API。绑定、状态历史、AuditLog、Outbox、幂等结果和乐观版本在 PostgreSQL 事务中闭合。数据库驱动 worker 使用 `FOR UPDATE SKIP LOCKED`，持久化 attempt STARTED/SUCCEEDED/FAILED，进程重启后可继续 BOUND/PROCESSING 项且不重复终态副作用。

## 5. 私有对象存储与权限

Compose 创建独立 Roster 与 Media private bucket、独立 app identity 和 policy。Media identity 只有 `media/*` 的最小 `GetObject/PutObject` 与受前缀限制的 list 能力，无 delete；Roster identity 不能访问 Media bucket，Media identity 不能访问 Roster bucket。App 不使用 MinIO root。匿名 GET、PUT、list 实测均为 HTTP 403。

签名上传能力绑定单一 server-generated key、Content-Type 和 Content-Length；普通响应、日志、AuditLog、Outbox 与公共 projection 均不返回 `storageKey`。上传和访问响应使用 `Cache-Control: no-store` 与 `Referrer-Policy: no-referrer`。访问 URL 只对本人 `AVAILABLE` 媒体签发短期只读 URL。

权限结果：STUDENT 仅本人 metadata/original；责任 TEACHER 可读 metadata，但原件稳定 403；ADMIN 不在当前 Media OpenAPI read role 中，metadata 与原件均 default deny。管理员原件访问仍受 ADR-068 阻塞。

## 6. Docker 运行验收

环境：Docker Client/Server 29.6.2，Compose v5.3.1，context `desktop-linux`，Linux amd64；project `bnbu-media-validation`。

- runtime image：`sha256:5f434e4ae670515d0ee62b93d9469bcb4434b961e62e557211fd7eeaa72446b0`，196,252,346 bytes，user `bnbu`，带真实 HTTP healthcheck。
- migrator image（显式 `--no-cache`）：`sha256:9b62482eab44386408d66e75173f306de5d29f71c2d497da725a27a194eb474c`，215,310,098 bytes，user `node`。
- runtime 与 migrator 均使用锁文件 `npm ci`；runtime 不含 `.env`、`.git`、测试目录或 Prisma migration，镜像 history 敏感关键词扫描为零。
- PostgreSQL `18.4-alpine3.24` healthy；MinIO 明确版本 healthy；MinIO init exit 0；App healthy、非 root、无 crash loop。
- 新空 volume 首次按序部署 0001–0006；重复 deploy 返回 `No pending migrations to apply`；Drift 为 `No difference detected`。
- App role `has_schema_privilege(..., 'CREATE') = false`；没有 ExerciseRecord/Review/Score/Export 表。

真实烟测覆盖：

- 既有 Foundation/Teaching/Enrollment/Roster：复用未修改的 Stage 13 runner，通过 83 个 HTTP/不变量断言。
- Stage 14：8 个 ExerciseSession operation 全部在容器 App 通过。
- Stage 15：真实 IMAGE 和合成 MP4 经 initiate → private PUT → confirm → bind → PROCESSING → AVAILABLE → access URL → object GET；稳定 ID 与幂等 replay 通过。
- Contract 1.5 增量：合成 15 秒有声 WebM 通过；15.001 秒、缺音轨、缺视频轨、伪造 MIME/容器和包含位置标签的 WebM 均被稳定拒绝。该增量不引入 FFmpeg/WASM 或上传后转码服务。
- 负向：MIME spoof、hash mismatch、跨学生、IMAGE 第七个、Teacher/Admin 原件、未来 Record/Review/Score/Export 假成功均被拒绝。
- restart：App healthy 恢复；PostgreSQL 停止时 readiness 503、恢复后 200；MinIO 重启 healthy；数据库行和对象均保留。
- worker recovery：重启前持久化 BOUND，重启后恢复为 AVAILABLE。
- production 缺完整 Media 配置时 exit 1，并明确报 `Media configuration must be either complete or omitted`。
- CORS allowlist 允许 `http://allowed.test`，拒绝其他 Origin；日志扫描 Token、Authorization、Cookie、password、DATABASE_URL、storageKey、signed URL 与合成 PII 命中 0。

临时环境和 smoke 脚本在 teardown 后删除；没有执行 system prune，也没有影响其他 project。

## 7. 测试与质量

- Unit：52/52
- Integration：29/29
- E2E：27/27
- Contract：15/15
- Security：26/26
- 总计：149/149，fail 0，skip 0，todo 0

Stage 14 的 135/135 全部包含在本轮回归中且持续通过。`npm ci`、format、lint、strict typecheck、contract、runtime coverage、Prisma validate、migration safety、schema drift、generated artifact、build、`npm audit --audit-level=high` 与 `git diff --check` 全部通过；audit 为 0 vulnerabilities。Redocly 的 6 个既有非阻塞 warning 保持可见，没有隐藏或编造 license。

## 8. Gate

以下为 **是**：Media Persistence、Stable Identity、Upload Capability、Private Storage、Confirm Integrity、Declared/Verified Separation、Session Binding、Processing、Availability、Student Metadata、Student Access、Count/Source、Media Core。

以下保持 **否**：

- Media Record Association：等待 Stage 16
- Media Teacher Review Access：等待正式 Record/Review 父关系
- Media Admin Original Access：否 / DEFAULT DENY
- Media Retention/Cleanup：否
- Media Production Security Processing：否
- Media Privacy/Location：否，ADR-029 未批准
- Media Production Parameters：否
- Enrollment Withdrawal/Rejoin：否 / DEFAULT DENY
- Roster Ignore：否 / DEFAULT DENY
- Roster Official API Sync、Roster Production Retention：否
- Session Offline Credit：否 / FAIL CLOSED
- Session Automatic Expiration、Session Production Parameters：否
- Record、Review、Score、Export、Full Production：否

ADR-023/029/030/040/060/068 和 ADR-070–074 均保持 PROPOSED。Stage 16 只具备可开始基线，不代表 ExerciseRecord 已实现。

本阶段未 push、未创建 Pull Request。
