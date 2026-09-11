# BNBU Sports Greenfield Stage 20B-P 接续提示词

> Stage 21 更新：本提示词的 staging 目标不变，但机器合同已扩展到 OpenAPI `1.3.0-contract`。执行前必须先读 `21-client-capabilities-contract-baseline.json`、`21-client-capabilities-operation-map.md`、`21-client-capabilities-local-integration-report.md` 和 `21-client-capabilities-default-deny-report.md`；22 项仅本地集成不得冒充 Staging/生产开放，其余 8 项必须继续作为真实 default deny 验证。

你现在需要执行：“Stage 20B-P — Synthetic Staging 基础设施决策落盘、部署准备与 Runtime Gate”。本阶段不是 Export、Production 或客户端业务联调；只有 staging runtime Gate 真实通过后，才允许另开任务开始 Auth 模块的 Android→Web 联调。

## 一、权威基线

- 根目录及唯一 Git 根：`C:\Users\23328\Desktop\new_version`
- 权威后端：`backend/`
- 唯一人工维护 API 机器合同：`docs/backend-contracts/openapi.yaml`
- Stage 20A 输入 HEAD：`ce133432d0aa247d29db78cc7e14a47d398bc5fc`
- 最终客户端批准落盘 HEAD：以旧账号最终输出和 `git rev-parse HEAD` 为准；输入 HEAD 必须是其祖先
- Monorepo 普通目录：`backend/`、`BNBU-Sports-Android-master/`、`BNBU-Sports-Web-new/`；gitlinks=0、nestedGit=0
- OpenAPI：version `1.3.0-contract`；当前工作树 SHA-256：`914084874afda2481813a041da4cc01249aa9ea557d9a8bf29baeed4f10e0dc9`
- runtime coverage：122 operations / 104 verified / 18 exact default deny / 0 not implemented / 0 blocked
- Migration：0001–0012，其中 0011 为 `client_capabilities`，0012 为 `ios_auth_release_exemption`；不得创建或冒充 `0011_export_core`
- Stage 19/20A 已提交基线证据：63 Unit + 41 Integration + 40 E2E + 27 Contract + 38 Security = 209/209

## 二、先读和 Git Gate

完整阅读：

1. `AGENTS.md`
2. `docs/backend-contracts/CURRENT-HANDOFF.md`
3. `docs/backend-contracts/20-client-integration-approval-template.md`
4. `docs/backend-contracts/20-client-integration-decision-pack.md`
5. `docs/backend-contracts/20-client-integration-contract-pack.md`
6. `docs/backend-contracts/20-client-contract-gap-inventory.md`
7. `docs/backend-contracts/20b-client-contract-baseline.json`
8. `docs/backend-contracts/20b-synthetic-staging-readiness-plan.md`
9. `docs/backend-contracts/20-stage20b-implementation-gate.md`
10. `docs/backend-contracts/decision-log.md`、OpenAPI、runtime manifest、Prisma schema 与 Stage 19 报告

执行：

```powershell
cd C:\Users\23328\Desktop\new_version
git status
git branch --show-current
git rev-parse HEAD
git log --oneline -20
git merge-base --is-ancestor ce133432d0aa247d29db78cc7e14a47d398bc5fc HEAD
git worktree list
git ls-files -s | Select-String "160000"
npm --prefix backend run repo-layout:check
Get-FileHash -Algorithm SHA256 docs/backend-contracts/openapi.yaml
```

必须工作树 clean、祖先检查 exit 0、OpenAPI hash 一致、layout `clients=2/gitlinks=0/nestedGit=0`、无进行中的 merge/rebase/cherry-pick/revert、0001–0010 与已接受的 `0011_client_capabilities` checksum 不变且不存在未登记 Migration。否则停止，不 stash/reset/restore/clean。

## 三、已经批准的事实

```text
APPROVED_INTEGRATION_ORDER=YES
APPROVED_GENERATED_CLIENT_STRATEGY=YES
APPROVED_MOCK_RETIREMENT_POLICY=YES
APPROVED_STAGING_ENVIRONMENT=YES
APPROVED_THREE_CLIENT_DEFINITION_OF_DONE=NO
CLIENT_INTEGRATION_APPROVAL_GATE=YES
CLIENT_INTEGRATION_PREPARATION_READINESS=YES
STAGING_CONSTRUCTION_APPROVED=YES
```

顺序固定为 Auth → Teaching/Enrollment → Session/Media/Record → Review → Score，每模块先 Android 学生端，再 Web 教师/管理员端。DTO/schema 来自同一 OpenAPI commit/hash，transport 手写。错误只按 `code`，mutation 遵循 idempotency/version，服务端事实和 Session→Media→Record→Review→Score 顺序不可绕过，production Mock/旧 API fallback 必须不可达。

## 四、尚未通过的 Gate

```text
STAGING_RUNTIME_READINESS=NO
CLIENT_INTEGRATION_EXECUTION_READINESS=NO
CLIENT_INTEGRATION_STARTED=NO
EXPORT_APPROVAL_GATE=NO
EXPORT_IMPLEMENTATION_READINESS=NO
PRODUCTION_APPROVAL_GATE=NO
FULL_PRODUCTION_GATE=NO
```

项目负责人尚未选择 staging 的具名域名、云/部署目标、Secret 托管产品和长期运维参数。不得自行把推荐供应商、临时 IP 或本地 Docker 冒充批准方案。若本任务仍未提供这些选择，只能输出缺口和互斥方案，不能部署或修改客户端。

## 五、Stage 20B-P 允许范围

在基础设施选择获得明确批准后：

1. 从最终批准落盘 clean HEAD 创建独立 staging-preparation 分支。
2. 建立与 local/production 隔离的 HTTPS synthetic staging；独立 PostgreSQL、private object storage、Secret 与 issuer/audience/CORS/cookie scope。
3. Secret 只通过批准的托管机制注入，不进入 Git、image、日志或客户端。
4. 实现/配置安全 synthetic seed/reset：环境 identity fail closed、仅合成账号、DB/bucket 精确清理、旧 Token 失效、可审计 requestId、重复运行确定。
5. 保持既有 0001–0011，执行空库 first/repeat migration、drift 0、App/Migrator 权限分离；不修改完成的 Migration。
6. 验证 122-operation disposition、private Media、Auth rotation/reuse/logout、Score、Audit/requestId tracing；四个 Export operation及 Stage 21 剩余 18 项必须继续 `SYSTEM_MODE_UNSUPPORTED`。12 项本地实现只有在独立 Staging 部署和验收通过后才能提升环境结论。
7. 为 Android/Web staging test build 准备显式单一 Base URL 与同一 OpenAPI hash；在 runtime Gate 前不改业务 UI，不开始 Auth 联调。
8. 验证 HTTPS、CORS/cookie/CSRF、日志脱敏、restart/persistence、reset safety、Mock/旧 API 不可达与 teardown。
9. 生成独立 runtime validation 报告；只有全部通过才把 `STAGING_RUNTIME_READINESS` 改为 YES。

## 六、严格禁止

- 不实现 Export，不创建 `0011_export_core`、Export 表/Job/worker/artifact/download URL。
- 不部署 Production，不创建正式域名/Secret，不使用真实学生数据，不连接旧数据库或旧远程 API。
- 不执行 Historical Data Migration，不创建 iOS 工程，不声称三端完成。
- staging runtime Gate 通过前不开始 Android/Web 业务联调；之后也只能从 Auth 的 Android 学生端开始。
- 不为旧 DTO、旧 path 或 Mock 修改 OpenAPI/后端事实。
- 不 push、不创建 Pull Request、不 merge/rebase/pull。

## 七、完成标准

完整记录选定基础设施、非 Secret 配置、image/digest、HTTPS、DB/object storage/Secret 隔离、seed/reset、122-operation smoke、private Media、Auth/Score/Audit/requestId、first/repeat migration、drift、权限、日志脱敏、restart/persistence、Mock 不可达与 teardown。若任一强制项失败，`STAGING_RUNTIME_READINESS=NO`，并准确报告阻塞。

该提示词不授权自动选择基础设施，也不授权直接开始客户端联调。
