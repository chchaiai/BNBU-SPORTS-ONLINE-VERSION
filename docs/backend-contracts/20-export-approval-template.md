# Stage 20A Export Approval Template

> 未完整批准前：四个 Export operation 继续 `SYSTEM_MODE_UNSUPPORTED`；不创建 `0011`、Export 表、ExportJob、worker、artifact 或下载 URL；`EXPORT_BUSINESS_GATE=NO`。

批准方式：项目负责人逐项填写唯一选项/明确值、日期和批准证据。`推荐`、勾选多项、空白或“以后再定”均不构成批准。详细权衡见 `20-export-production-integration-decision-pack.md`。

| 决策                     | 必须批准的唯一结果                    | 当前推荐（非批准）                               | 用户选择                 | 批准日期/证据 |
| ------------------------ | ------------------------------------- | ------------------------------------------------ | ------------------------ | ------------- |
| EXP-DEC-01 V1 ExportType | 明确允许的 enum、filter、数据源和角色 | 仅 `STUDENT_SCORES`，个人/教学班两种 scope       | `USER_APPROVAL_REQUIRED` |               |
| EXP-DEC-02 格式          | 主格式与兼容格式                      | CSV only，UTF-8 BOM                              | `USER_APPROVAL_REQUIRED` |               |
| EXP-DEC-03 数据版本      | latest/历史 PUBLISHED/LOCKED 策略     | 允许指定 PUBLISHED/LOCKED，默认 latest PUBLISHED | `USER_APPROVAL_REQUIRED` |               |
| EXP-DEC-04 权限          | STUDENT/TEACHER/ADMIN 各自 scope      | TEACHER 本人班 + ADMIN 本组织；STUDENT 不开放    | `USER_APPROVAL_REQUIRED` |               |
| EXP-DEC-05 存储          | bucket/prefix/DB/disk                 | 独立 private export bucket                       | `USER_APPROVAL_REQUIRED` |               |
| EXP-DEC-06 保留          | artifact 与 metadata 的明确策略       | artifact 30 天；metadata 服从 retention matrix   | `USER_APPROVAL_REQUIRED` |               |
| EXP-DEC-07 下载 TTL      | 5/10/15 分钟、重新鉴权、审计          | 10 分钟，每次 issuance 重新鉴权并审计            | `USER_APPROVAL_REQUIRED` |               |
| EXP-DEC-08 worker        | 同步/App 内/独立/外部队列             | 独立 worker deployment + PostgreSQL claim/lease  | `USER_APPROVAL_REQUIRED` |               |
| EXP-DEC-09 内容安全      | 字段、顺序、格式、PII、注入规则       | 最小成绩字段，无联系方式/internal ID/fingerprint | `USER_APPROVAL_REQUIRED` |               |
| EXP-DEC-10 稳定性        | 旧文件是否不可变                      | 创建时 revision 永久绑定，变化建新 Job           | `USER_APPROVAL_REQUIRED` |               |
| EXP-DEC-11 retry         | 次数、backoff、错误分类、manual retry | 3 次：30s/2m/10m，仅 transient                   | `USER_APPROVAL_REQUIRED` |               |
| EXP-DEC-12 通知          | polling/in-app/email/none             | 客户端退避轮询                                   | `USER_APPROVAL_REQUIRED` |               |

## 总批准

```text
ALL_EXP_DECISIONS_APPROVED=NO
EXPORT_ADR_ACCEPTED=NO
OPENAPI_EXPORT_CONTRACT_FROZEN=NO
EXPORT_IMPLEMENTATION_AUTHORIZED=NO
APPROVER=
APPROVED_AT=
APPROVAL_EVIDENCE=
```

只有全部为 YES，且有不可变批准证据，Stage 20B 才能设计 `0011_export_core`；仍不得自动修改客户端或 Production Gate。
