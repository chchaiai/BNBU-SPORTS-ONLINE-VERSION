# Greenfield 权威后端基线

> 状态：`ACCEPTED`
> 决策日期：2026-08-02
> 适用分支：`backend/greenfield-foundation`
> 机器合同：`docs/backend-contracts/openapi.yaml`

## 1. Greenfield 决策背景

阶段 0–9 已经形成统一业务合同，但根仓库中没有可继承的权威后端源码、数据库 schema、migration history 或 seed。项目负责人现已明确选择 Greenfield：从已接受业务决策和统一合同出发建立新后端，而不是继续寻找、修复或猜测旧远程服务。

本轮目标是建立可维护、可测试、可迁移的 Foundation，包括工程、数据库、认证、授权、幂等、审计、Outbox、系统模式、组织、基础用户/Profile、学期、健康检查、合同测试、本地环境和 CI。它不等同于一次性实现全部体育打卡业务。

## 2. 为什么旧远程 API 不是权威基线

旧远程 API 只有客户端侧的零散调用痕迹，没有受控源码、数据库结构、迁移历史、部署清单或可审计的运行证据。因此它被定义为未知遗留黑盒：

- 不用它反推新数据库、认证模型、错误语义或业务规则；
- 不连接、不读取、不修改其数据库；
- Android 旧 DTO 和 Web Mock 只作为未来迁移输入，不是后端事实；
- 是否提供兼容 Adapter，要等客户端迁移阶段取得真实调用遥测后再决定；
- 没有调用遥测和下线计划前，不宣称旧接口可以删除。

这项隔离避免把未知历史行为误固化进新的权威合同，同时保留以后对真实客户端进行受控兼容的空间。

## 3. 新后端唯一源码路径

唯一权威源码路径是根仓库的 `backend/`。它由根仓库当前分支直接跟踪，是普通目录，不是 Git submodule。

任何后端运行代码、Prisma schema、版本化 migration、seed、Dockerfile、本地 Compose、测试和后端运行文档都必须位于 `backend/` 内。Android 和 Web 子模块的提交指针不因 Foundation 建设而改变。

## 4. 新数据库基线

- 数据库产品：PostgreSQL 18；Foundation 锁定当前补丁线 18.4。
- 初始数据库：全新空库，不导入或伪造旧 schema 与旧 migration history。
- 变更入口：只能执行 `backend/` 内版本化 migration；应用启动不得自动迁移数据库。
- ORM：Prisma 当前稳定版，并以官方对 Node.js 24 和 PostgreSQL 18 的支持范围为兼容前提。
- 物理规则：UUID 主键、snake_case、`timestamptz`、明确的 `date`/`time`、秒数使用 `bigint`、分数使用定点 `numeric`、受控 `jsonb`；核心关系不得藏入 JSON。
- 高级约束：Prisma 无法完整表达的 partial unique、check、索引和 append-only 约束使用受版本控制的 SQL migration 明确建立并测试。

PostgreSQL 官方建议同一大版本使用当前 minor；Prisma 官方支持清单明确包含 PostgreSQL 18 和 Node.js 24。版本证据在 2026-08-02 核验，依赖和镜像仍必须由锁文件及精确标签固定。

## 5. 技术栈

| 层 | 已接受基线 | 锁定方式 |
|---|---|---|
| Runtime | Node.js 24 LTS；容器基线 `24.18.0` | `engines`、CI matrix、精确 Docker tag |
| 包管理 | npm 11 | `package-lock.json`，CI 只用 `npm ci` |
| 语言 | TypeScript 5.9.3，`strict: true` | 当前稳定 Nest/ESLint/codegen 生态的受支持版本；TS 7.0.2 因 peer 上限不兼容而不强制安装，见 ADR-089 |
| 模块系统 | ESM，不混用 CommonJS | `package.json#type` 与编译配置 |
| 应用框架 | NestJS 11.1.28 | 精确依赖 |
| ORM/Migration | Prisma 7.9.1 | 精确依赖与版本化 migration |
| 数据库 | PostgreSQL 18.4 | 精确容器 tag |
| API | REST JSON，统一前缀 `/api/v1` | OpenAPI contract gate |
| 对象存储 | S3-compatible Port；local 使用 MinIO | 基础设施 Adapter 与环境配置 |
| 部署形态 | Docker 容器化模块化单体 | 多阶段 Dockerfile 与 Compose |

版本选择只采用稳定发行，不使用 alpha、beta、rc、canary 或 `next` 标签。未来升级必须通过依赖锁、编译、单元测试、合同测试、真实 PostgreSQL 集成测试和 migration replay 后单独提交。

## 6. 模块化单体架构

首个部署单元是一个 NestJS 模块化单体。模块通过明确的 domain/application/infrastructure/http 边界协作；数据库可以共享同一 PostgreSQL 实例，但不得绕过应用服务读取其他模块的未公开内部语义。

需要跨领域原子性的写入在同一 PostgreSQL 事务内完成。业务事务只写领域状态、AuditLog 和 Outbox；发送邮件、对象存储后处理或其他外部副作用由 Outbox worker 在提交后执行。初期不引入 Kafka、RabbitMQ，也不强制依赖 Redis；幂等和 Outbox 先由 PostgreSQL 提供持久化与并发控制。

系统不采用完整 Event Sourcing。少数 append-only 历史表用于业务裁决和审计，不能被解释为可用事件重建所有聚合。

## 7. OpenAPI 权威关系

权威顺序固定为：

已接受业务决策 → 统一业务规则 → `docs/backend-contracts/openapi.yaml` → 后端实现 → 客户端实现 → Mock 与展示文案。

`openapi.yaml` 是唯一人工维护的 API 机器合同。后端不得从装饰器或运行代码反向覆盖它；运行时 Swagger 如启用，只用于本地观察实现，不成为新的合同源。每个 operation 必须具备唯一 `operationId`、明确的 `x-access-policy`、已注册错误以及稳定的请求/响应 schema，并由自动合同测试验证双向覆盖。

## 8. 本地、测试、staging、production 环境定义

| 环境 | 目的 | 数据与依赖 | 当前状态 |
|---|---|---|---|
| local | 开发、手工验证和可重复 seed | Docker PostgreSQL 18.4、MinIO、仅合成 BNBU 数据；Secret 来自本机环境 | 本轮建立 |
| test | 单元、合同、集成和 e2e | 隔离测试库/容器；每次运行可重建；不得使用真实学生数据 | 本轮建立 |
| staging | 上线前迁移、客户端和运维验证 | 独立数据库、对象存储、密钥、域名和监控；不得与 production 共用凭证 | 尚未建立 |
| production | 真实业务运行 | 经批准的数据生命周期、Secret、HTTPS、备份恢复、告警和责任体系 | 尚未建立，门禁关闭 |

配置必须显式区分环境。production 缺少密钥、issuer/audience、Token TTL、数据库连接、允许来源等必需项时必须启动失败；代码不得内置可用于 production 的默认 Secret。

## 9. 初始部署边界

Foundation 交付目标是“可构建、可迁移、可测试的本地与 CI 基线”，不是 production 上线。允许暴露的 HTTP 能力仅限健康/就绪、系统模式读取、密码登录、刷新、登出、当前用户、当前组织和学期读取等 Foundation 合同。

首个 migration 只建立 Organization、SystemPolicy、User/Profile、AuthSession、RefreshToken、Semester、IdempotencyRecord、AuditLog 和 OutboxEvent。应用容器不在启动时自动执行 migration；部署者必须把 migration 作为独立、可审计步骤执行。

## 10. 暂不实现的能力

以下能力仍处于 Business Module Gate，本轮不得创建返回假成功的 controller、空 service 或伪持久化：

- Course/ClassSection 完整写操作；
- Enrollment 与 QR Join 完整业务；
- 官方名单导入与对齐；
- ExerciseSession 可信计时完整业务；
- MediaEvidence 上传、扫描与绑定完整链路；
- ExerciseRecord 提交；
- 教师 Review；
- StudentScore 计算与发布；
- Export 执行任务。

合同可以先定义后续边界、枚举和 default-deny 行为，但不得把“已建合同”报告为“已实现业务”。

## 11. 后续客户端迁移原则

- 以一个稳定 `recordId` 贯穿学生提交、API、教师审核、数据表和凭证文件，做真实跨端验收；
- 客户端只负责交互、采集、本地临时草稿、非权威预估和服务端结果展示；
- Android 旧远程调用与 Web Mock 不反向决定新 API；迁移时通过显式 Adapter、功能开关和版本矩阵处理差异；
- 真模式不得在网络/合同失败时静默回落到 Mock；Mock 必须显著标记并使用合成数据；
- 旧接口的冻结、兼容、观察和删除必须基于调用遥测、支持版本窗口和可回滚发布计划。

## 12. 风险与回滚边界

- **合同风险**：尚未通过 Business Module Gate 的规则保持 default deny；不以临时代码补齐未知含义。
- **遗留兼容风险**：Greenfield 不改旧远程服务。客户端切换在后续分支进行，因此 Foundation 回滚不会破坏旧黑盒。
- **数据库风险**：当前没有 staging/production 数据。首个 migration 只针对空 PostgreSQL 18；禁止把开发期破坏性重建脚本带入 production 流程。
- **供应商风险**：对象存储通过 Port 隔离；local MinIO 不承诺 production 供应商。
- **运营风险**：备份恢复、密钥轮换、媒体治理、审计保留、告警责任和隐私审批未完成前，Production Gate 保持关闭。
- **代码回滚**：每个阶段独立本地提交；未部署时可通过后续 revert 提交回退代码。不得使用覆盖用户工作树或重写历史的命令。
- **数据回滚**：一旦未来存在真实数据，优先采用向前修复和兼容 migration；任何 destructive rollback 必须另有备份、恢复验证和审批，不能由应用自动执行。

Foundation 的成功标准是其自身门禁有证据通过。它不会自动打开 Course/Enrollment、Session/Media/Record、Review、Score 或完整 Production Gate。
