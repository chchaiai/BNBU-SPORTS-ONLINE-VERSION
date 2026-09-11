# Stage 13 — Official Roster Alignment 确定性算法

> 状态：Stage 13 实现前冻结规范
>
> 算法版本：`ROSTER_ALIGNMENT_V1`
>
> 适用范围：FILE 名单导入、不可变平台快照、六类对齐结果、重跑与处置投影

## 1. 目标与不变量

本文件冻结 Stage 13 对齐算法的输入、规范化、分类顺序和可复现性要求。实现和测试必须逐项符合本文件；若实现需要改变本文件，必须先依据最新 ACCEPTED ADR 更新权威合同，不能在代码中暗改语义。

以下不变量始终成立：

1. `OfficialRosterEntry` 是某一官方名单版本中的不可变快照事实，不是 `Enrollment`。
2. `Enrollment` 是平台真实入班关系；对齐只读 Enrollment，不创建、删除、修改或转班。
3. 对齐、确认、解决、重开、回滚均不得创建或修改 `User`、`StudentProfile`、`Enrollment`。
4. 首要业务匹配键仅为 `organizationId + normalizedStudentNumber`。
5. 姓名、性别、年级只用于一致性核验，绝不能建立或扩大身份关系。
6. 一个 subject 在一个 Run 中必须且只能产生一个算法状态。
7. 算法状态不可人工修改；人工动作只改变独立的 `resolutionStatus` 投影并追加历史事件。
8. Run、平台快照和 Result 在发布后不可变；重跑创建新 revision，旧事实永久保留。

## 2. FILE 输入合同

### 2.1 V1 唯一允许的格式

V1 只接受同时满足以下条件的 FILE 导入：

- 文件扩展名为 `.csv`；
- MIME 为 `text/csv`；
- 内容可按严格 UTF-8 解码；
- 文件开头允许零个或一个 UTF-8 BOM，BOM 只在解码入口移除一次；
- CSV 标题和 field mapping 均来自合同白名单；
- 所有单元格均按纯文本处理，不执行公式。

`.xlsx`、`.xls`、`.ods`、ZIP、PDF、图片、OCR 输入、远程 URL 和邮件附件均不属于 V1。特别地，即使 XLSX 内容可被某个库解析，也必须以稳定错误 `ROSTER_FILE_INVALID` 拒绝，且不得创建可发布的 Import、Entry、Audit 成功事实或业务 Outbox。

任何以 `=`、`+`、`-`、`@` 开头的公式样式值都不得被计算，也不得作为有效业务字段静默接受；该行按结构化错误进入 `INVALID`。

### 2.2 行分类和统计

CSV 标题行不计入 `totalRowCount`。每一条数据行必须精确归入以下一个且仅一个导入层状态：

- `VALID`
- `INVALID`
- `DUPLICATED`

统计必须满足：

```text
totalRowCount = validRowCount + invalidRowCount + duplicatedRowCount
```

规则如下：

1. 无效行和重复行仍保存为不可变 `OfficialRosterEntry`，并保存安全、结构化的错误码。
2. 同一 Import 中同一 `normalizedStudentNumber` 出现多条时，相关冲突行标为 `DUPLICATED`；系统不得任意挑选一行降级为 `VALID`。
3. 只有 `rowValidationStatus = VALID` 的 Entry 可以进入对齐候选集合。
4. `VALID` Entry 集合中的 `normalizedStudentNumber` 必须唯一；若持久化事实违反该不变量，对齐必须 fail closed，不能任选一条继续。
5. 至少存在一条 `VALID` Entry，Import 才能进入 `VALIDATED` 并成为 current。
6. `validRowCount = 0` 的 Import 不得发布为 `VALIDATED/current`，不得用于对齐。

导入层 `DUPLICATED` 与对齐层 `RosterAlignmentStatus.DUPLICATED` 是不同事实：前者用于阻止有歧义的官方行参与匹配；后者在 V1 中用于表达平台冻结快照内同一匹配键存在多条冲突 ACTIVE Enrollment。两者不得混写为一个状态字段。

## 3. 字段规范化

### 3.1 studentNumber

`studentNumber` 必须沿用现有统一身份合同的规范化函数：

```text
normalizedStudentNumber = studentNumber.trim().toUpperCase()
```

额外要求：

- 输入和输出都按 string 处理；
- 永不转成 number、BigInt 或浮点数；
- 保留所有前导零，例如 `"  0007a  " -> "0007A"`；
- 大小写转换必须使用服务端现有确定性实现，不依赖请求 locale；
- 不删除内部字符，不进行模糊修复，不把非法值改成另一个学生的学号；
- 不是 `User.id`、`StudentProfile.id` 或 `Enrollment.id` 的替代品；
- 日志、错误和审计摘要不得输出完整学号。

### 3.2 fullName

对官方名单和平台身份快照的姓名使用完全相同的核验规范化：

```text
normalizedFullName = UnicodeNFC(fullName.trim())
```

不得执行：

- 大小写或空白之外的猜测性修正；
- 姓名相似度、编辑距离、拼音、别名或音译匹配；
- 删除连字符、间隔号、重音符号或其他可能具有身份意义的字符；
- 通过姓名、手机号或邮箱建立身份关系。

姓名仅在 `organizationId + normalizedStudentNumber` 已确定同一候选 subject 后进行精确一致性核验。

### 3.3 其他核验字段

V1 差异字段白名单为：

- `FULL_NAME`
- `GENDER`
- `GRADE_YEAR`

姓名始终核验。`gender` 或 `gradeYear` 仅在官方 Entry 对应字段非 null 时核验；官方值为 null 表示该维度没有官方断言，不应制造冲突。比较前必须使用各字段现有统一枚举或规范化规则，不能由对齐模块创建第二套转换规则。

## 4. 冻结输入

一次对齐由以下不可变输入共同定义：

- `organizationId`
- `semesterId`
- 目标 `classSectionId`
- `rosterImportId` 与其 `versionNumber`
- 该 Import 中全部 `VALID` Entry
- 同一 `organizationId + semesterId` 下全部 `ACTIVE` Enrollment 的最小平台快照
- `algorithmVersion = ROSTER_ALIGNMENT_V1`
- 服务端生成的 `platformSnapshotFingerprint`
- 服务端分配的 `comparisonRevision`
- `startedBy`、`startedAt`、`completedAt`

平台快照必须覆盖同一 Semester 的所有 ACTIVE Enrollment，而不是只读取目标 ClassSection。否则无法确定性地区分 `WRONG_COURSE`、`MISSING_IN_PLATFORM` 和平台重复事实。

每条 `RosterAlignmentPlatformEntry` 仅冻结算法所需字段：

```text
enrollmentId
studentId
classSectionId
semesterId
normalizedStudentNumber
normalizedFullName
gender
gradeYear
enrollmentStatus = ACTIVE
```

快照不得包含邮箱、手机号、密码、Token、Cookie、文件 `storageKey`、signed URL 或任意客户端提交的身份字段。客户端只提交 `expectedRosterImportVersion`；平台快照必须完全由服务端查询、冻结并计算 fingerprint。

## 5. platformSnapshotFingerprint

`platformSnapshotFingerprint` 必须通过以下方式生成：

```text
lowerHex(SHA-256(UTF8(canonicalPlatformSnapshotJson)))
```

`canonicalPlatformSnapshotJson` 使用固定 schemaVersion 1，固定字段顺序，并具有以下逻辑形状：

```json
{
  "schemaVersion": 1,
  "organizationId": "org_synthetic",
  "semesterId": "sem_synthetic",
  "entries": [
    {
      "enrollmentId": "enr_synthetic",
      "studentId": "stu_synthetic",
      "classSectionId": "cls_synthetic",
      "semesterId": "sem_synthetic",
      "normalizedStudentNumber": "0007A",
      "normalizedFullName": "Jó Test",
      "gender": null,
      "gradeYear": 2028,
      "enrollmentStatus": "ACTIVE"
    }
  ]
}
```

Canonical 规则：

1. 顶层键顺序固定为示例顺序；entry 键顺序也固定为示例顺序。
2. entries 按 `normalizedStudentNumber`、`classSectionId`、`enrollmentId`、`studentId` 依次进行代码点升序排序；`studentId` 是最终稳定 tie-breaker。
3. 字符串采用 UTF-8；姓名先做 NFC；JSON 前后无 BOM、无缩进、无无意义空白。
4. 可空字段必须显式写 `null`，不能因序列化器配置而省略。
5. 整数使用十进制 JSON number，不允许浮点或本地化格式。
6. 不包含数据库查询顺序、对象键插入顺序、`startedAt`、actor、requestId 或 Idempotency-Key。
7. 相同事实无论查询顺序如何必须得到相同 fingerprint；任一算法输入字段变化必须得到不同 fingerprint。

Fingerprint 是内部一致性标识，不进入普通日志或学生投影，也不能被当作授权凭据。

## 6. stable subjectKey

每个候选学号在一个 Run 中只创建一个 subject。稳定键定义为：

```text
subjectKey = lowerHex(SHA-256(UTF8(
  "ROSTER_SUBJECT_V1\u0000" +
  organizationId + "\u0000" +
  semesterId + "\u0000" +
  normalizedStudentNumber
)))
```

要求：

- 前缀、字段顺序和 NUL 分隔符固定，防止字符串拼接歧义；
- `normalizedStudentNumber` 必须先按第 3 节规范化；
- 输出为 64 位小写十六进制 SHA-256；
- 同一组织、学期和规范化学号跨 comparison revision 保持稳定；
- 不使用姓名、sourceRowNumber、数组下标或查询顺序；
- 数据库至少强制 `unique(alignmentRunId, subjectKey)`；
- subjectKey 属于内部关联信息，不作为公共 ID、授权凭据或日志内容。

## 7. 候选索引

在冻结输入上构造以下只读索引：

```text
officialByNumber:
  VALID OfficialRosterEntry 按 normalizedStudentNumber 分组

targetActiveByNumber:
  目标 classSectionId 的平台快照按 normalizedStudentNumber 分组

semesterActiveByNumber:
  同学期全部平台快照按 normalizedStudentNumber 分组

candidateNumbers:
  keys(officialByNumber) UNION keys(targetActiveByNumber)
```

`candidateNumbers` 以规范化学号代码点升序遍历。每个 candidate 只执行一次第 8 节的优先级判定并创建一个 Result。`WRONG_COURSE` 所需的其他班事实从 `semesterActiveByNumber` 读取，但其他班的纯平台 extra 不会凭空成为目标班结果。

## 8. 六类唯一分类优先级

对每个 candidate，令：

- `O`：该学号的 VALID 官方 Entry 集合；按导入不变量其数量只能为 0 或 1。
- `T`：目标 ClassSection 中该学号的 ACTIVE Enrollment 快照集合。
- `S`：同一 Semester 全部 ClassSection 中该学号的 ACTIVE Enrollment 快照集合。
- `X = S - T`：同学期其他 ClassSection 中的集合。

按以下顺序短路判定；命中一条后立即结束，不得继续生成第二类：

| 优先级 | 精确条件 | 唯一结果 | 结果引用                                             |
| ------ | -------- | -------- | ---------------------------------------------------- |
| 1      | `        | S        | > 1`，即平台同学期同一匹配键存在多条冲突 ACTIVE 事实 | `DUPLICATED` | 不任选一条匹配；只保存安全冲突摘要和可复核快照引用 |
| 2      | `        | O        | = 1`且`                                              | T            | = 1`，所有受核对字段一致                           | `MATCHED`             | 唯一 Entry + 唯一 target Enrollment                      |
| 3      | `        | O        | = 1`且`                                              | T            | = 1`，至少一个受核对字段不同                       | `IDENTITY_CONFLICT`   | 唯一 Entry + 唯一 target Enrollment + 白名单 differences |
| 4      | `        | O        | = 1`、`                                              | T            | = 0`且`                                            | X                     | = 1`                                                     | `WRONG_COURSE` | 唯一 Entry + 唯一 other-class Enrollment；公共投影不得泄露其他班敏感数据 |
| 5      | `        | O        | = 1`且`                                              | S            | = 0`                                               | `MISSING_IN_PLATFORM` | 唯一 Entry，Enrollment 引用为 null                       |
| 6      | `        | O        | = 0`且`                                              | T            | = 1`                                               | `EXTRA_IN_PLATFORM`   | Entry 引用为 null，唯一 target Enrollment                |

完整性守卫：

- 若 `|O| > 1`，说明 Import 发布不变量已被破坏，整个 Run 以安全错误 fail closed；不得任选一条，也不得发布部分结果。
- Import 中标为 `DUPLICATED` 的官方行已在导入层保留和统计，但不进入 `O`、candidateNumbers 或身份核验。
- 若某 candidate 未精确命中六条中的一条，整个 Run 必须失败；不得返回通用空数组、猜测结果或部分 current revision。
- `IDENTITY_CONFLICT` 命中后不得再为同一事实创建 `EXTRA_IN_PLATFORM`。
- `WRONG_COURSE` 命中后不得再创建 `MISSING_IN_PLATFORM`。
- `DUPLICATED` 命中后不得任意选择某条 Enrollment 继续匹配。

平台 `DUPLICATED` 的优先级最高，因此即使其中一条 Enrollment 位于目标班且身份字段表面一致，也不能产生 `MATCHED`。

## 9. differences 与初始 resolutionStatus

`differences` 只能保存第 3.3 节白名单中的差异，且每个字段最多出现一次。数组按 `FULL_NAME`、`GENDER`、`GRADE_YEAR` 固定顺序输出，不能依赖对象遍历顺序。

初始人工处置投影：

| 算法状态  | 初始 resolutionStatus |
| --------- | --------------------- |
| `MATCHED` | `RESOLVED`            |
| 其余五类  | `PENDING`             |

`resolutionStatus` 的变化不能修改算法 `status`、subjectKey、differences 或冻结快照。新命令不得进入 `IGNORED`；ignore 路由固定返回 `ROSTER_IGNORE_NOT_ALLOWED` 且零副作用。

## 10. comparisonRevision、幂等与重跑

### 10.1 revision 分配

- `comparisonRevision` 在同一 ClassSection 内从 1 开始单调递增。
- 分配必须在 PostgreSQL 事务与 ClassSection 级数据库互斥内完成。
- 已分配给 COMPLETED 或 FAILED Run 的 revision 永不复用。
- 数据修复、名单版本切换、平台快照变化或显式重跑都创建新 Run 和新 revision。

### 10.2 幂等

对齐命令的幂等请求绑定至少包含：

```text
operationId
organizationId
classSectionId
rosterImportId
algorithmVersion
platformSnapshotFingerprint
Idempotency-Key
canonical request hash
```

- 同一个 Idempotency-Key 与完全相同的绑定输入精确重放原 Run，不创建新 revision。
- 同一个 key 搭配不同 request hash 或不同绑定输入返回幂等冲突。
- 使用新的 Idempotency-Key 发起显式重跑，即使快照内容相同，也创建下一个 revision；旧 Run/Result 保留。
- `expectedRosterImportVersion` 与锁内 current Import 版本不一致时返回 `ROSTER_ALIGNMENT_INPUT_VERSION_CONFLICT`；服务端快照在发布前变化时返回 `ROSTER_ALIGNMENT_SNAPSHOT_STALE`，不发布 Run 结果。

## 11. 不可变发布、current 与 superseded

1. Run 创建为 `RUNNING`，冻结全部平台 Snapshot Entry 后再计算。
2. Snapshot、全部 Result、`resultCount`、完成状态、AuditLog 和 Outbox 必须以可恢复的事务边界全成或全不发布。
3. 失败 Run 可保存不含 PII/SQL/stack 的安全失败码，但不得发布部分 Results 为 current。
4. COMPLETED Run 的算法输入、Snapshot 和 Results 禁止 UPDATE/DELETE。
5. current revision 使用独立原子指针或等价关系表达，不通过覆盖旧 Run/Result 表达。
6. 新 Run COMPLETED 后，current 指针在同一事务切换至新 revision；旧 revision 由指针关系派生为 superseded。
7. 历史 Run、Result、Snapshot 和 ResolutionEvent 继续可按授权读取，不物理删除，也不根据当前 Enrollment/Profile 重新解释。
8. 名单 rollback 只切换 current Import 指针。rollback 后，针对其他 Import 的旧 Alignment 不能冒充当前结果；需要时显式重跑产生新 revision。

若物理模型保存 `supersededAt`，它只能作为 current 指针切换时的受控投影，不能改变旧 Run 的算法事实，也不能删除历史。优先使用独立 current pointer 以保持 Run 完全不可变。

## 12. 并发规则

同一 ClassSection 同时最多存在一个 `RUNNING` Alignment：

1. 使用 PostgreSQL 唯一约束、partial unique index、事务 advisory lock 或等价数据库强约束；不得使用进程内 `Map`、单实例 mutex 或定时猜测。
2. 获得 ClassSection 互斥后，重新校验 Teacher ownership、organization scope、Import 状态和 current/version 前置条件。
3. 在同一一致性事务视图中读取同 Semester 全部 ACTIVE Enrollment 并生成 Snapshot/fingerprint。
4. 并发请求未命中同 key 幂等重放且已有 RUNNING Run 时，返回 `ROSTER_ALIGNMENT_IN_PROGRESS`。
5. 发布前再次验证锁内前置条件；Import current/version 或请求 snapshot 前置条件变化时返回 `ROSTER_ALIGNMENT_SNAPSHOT_STALE`。
6. 失败不得留下 current 指针、部分 Snapshot、部分 Results、成功 AuditLog 或业务 Outbox。

## 13. 隐私投影

### 13.1 Teacher

责任 Teacher 只能读取本人 ClassSection 的 Import、Entry、Run、Result 和处置历史。可返回完成业务处置所需的学号/姓名/差异，但不得返回：

- `sourceFileStorageKey`
- signed URL 或永久公开 URL
- `rawRowSnapshotSafe`
- 平台 snapshot fingerprint 或完整内部快照
- 其他 ClassSection 的完整成员资料
- 邮箱、手机号、Token、Cookie、密码或内部数据库错误

`WRONG_COURSE` 只返回最小、已授权的“存在于其他班”提示和稳定 reasonCode；不得泄露另一责任教师或其完整班级名单。

### 13.2 Admin

ADMIN 只允许本 organization 的只读治理投影。默认返回 Import/Run 状态、计数、版本和安全标识；不代行 Teacher mutation，不获得源文件 key/signed URL，也不因 ADMIN 角色绕过资源 scope。

### 13.3 Student

STUDENT 对 Roster Import、Entry、Alignment、Snapshot 和 Resolution 一律禁止访问，不存在学生 Roster projection。

所有角色的日志、AuditLog 和 Outbox 均不得包含完整学号、完整名单行、raw snapshot、storageKey 或 signed URL。

## 14. 确定性伪代码

```text
assert import.status == VALIDATED
assert import.validRowCount >= 1
assert import.totalRowCount == valid + invalid + duplicated

with databaseClassSectionLock(classSectionId):
  validOfficial = loadImmutableValidEntries(rosterImportId)
  assert unique(validOfficial.normalizedStudentNumber)

  platform = freezeAllActiveEnrollments(organizationId, semesterId)
  fingerprint = sha256(canonicalize(platform))
  assertRequestSnapshotPrecondition(fingerprint)

  run = allocateNextRevision(ROSTER_ALIGNMENT_V1, fingerprint)

  for number in sorted(keys(validOfficial) union keys(targetActive(platform))):
    subjectKey = stableSubjectKey(organizationId, semesterId, number)
    result = classifyExactlyOnce(number, validOfficial, platform)
    appendImmutableResult(run, subjectKey, result)

  assert resultCount == count(unique subjectKey)
  atomicallyPublishCompletedRunAndCurrentPointer(run)
```

## 15. 合成测试向量

下表数据全部为虚构。`A` 为目标 ClassSection，`B`/`C` 为同组织同 Semester 的其他 ClassSection；除特别注明外，官方行均为 `VALID`。

| ID  | 官方输入                                             | 平台冻结快照                            | 预期结果 / 断言                                                                |
| --- | ---------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| N01 | 学号 `" 0007a "`，姓名 `测试甲`                      | A 班学号 `0007A`，姓名 `测试甲`         | 规范化保留前导零并转大写；`MATCHED`                                            |
| N02 | 学号 `0008`，姓名由 `J` + `o` + combining acute 组成 | A 班同学号，姓名为预组合 NFC `Jó`       | 双方 NFC 后一致；`MATCHED`                                                     |
| N03 | `0009 / 测试甲`                                      | A 班 `0009 / 测试乙`                    | `IDENTITY_CONFLICT`，differences 仅含 `FULL_NAME`；不得另产 EXTRA              |
| N04 | `0010 / 测试丙`                                      | 同 Semester 无该学号                    | `MISSING_IN_PLATFORM`                                                          |
| N05 | 无 `0011`                                            | A 班存在 `0011 / 测试丁`                | `EXTRA_IN_PLATFORM`                                                            |
| N06 | `0012 / 测试戊`                                      | A 班无；B 班唯一 ACTIVE `0012`          | `WRONG_COURSE`；不得另产 MISSING                                               |
| N07 | `0013 / 测试己`                                      | A、B 各存在一个 ACTIVE `0013`           | 优先 `DUPLICATED`；不得任选 A 继续 MATCHED                                     |
| N08 | CSV 有 `0014` 两行、另有一个 VALID `0015`            | 任意                                    | `0014` 两行均为导入层 DUPLICATED 且不参与对齐；只对 `0015` 生成候选            |
| N09 | 2 VALID、1 INVALID、1 DUPLICATED                     | 任意                                    | `total=4, valid=2, invalid=1, duplicated=1`；仅 2 个 VALID subject 可参与对齐  |
| N10 | 同一 VALID Import                                    | 相同 snapshot，以相反数据库返回顺序读取 | canonical JSON 与 SHA-256 fingerprint 完全相同                                 |
| N11 | 同一 VALID Import                                    | 仅 `gradeYear` 从 2028 改为 2029        | fingerprint 必须变化；旧 snapshot 前置条件返回 STALE                           |
| N12 | 同一请求、同一 Idempotency-Key 重放                  | 相同 snapshot                           | 返回原 Run/revision，结果数不增加                                              |
| N13 | 相同输入、使用新 Idempotency-Key 显式重跑            | 相同 snapshot                           | 创建下一 `comparisonRevision`；subjectKey 相同，Run/Result ID 新增，旧结果保留 |
| N14 | 上传扩展名 `.xlsx`、XLSX MIME/内容                   | 无                                      | `ROSTER_FILE_INVALID`；不创建可发布 Import，不进入解析                         |
| N15 | UTF-8 CSV 仅有 INVALID/DUPLICATED 行                 | 无                                      | `validRowCount=0`；不得成为 VALIDATED/current，不得运行 alignment              |
| N16 | 同一 org/semester/student number，revision 1 与 2    | 任意                                    | 两次 subjectKey 相同；`unique(runId, subjectKey)` 均成立                       |
| N17 | 同一学号、官方 gender 为 null                        | 平台 gender 任意                        | 不因官方无断言产生 GENDER 差异                                                 |
| N18 | 同一学号，官方姓名仅 trim 后与平台不同               | A 班唯一匹配                            | 不模糊合并；`IDENTITY_CONFLICT`                                                |

实现至少还要通过属性测试：对官方 VALID rows 和平台 snapshot 分别做任意排列，结果集合、每个 subjectKey、status、differences 顺序和 fingerprint 均保持不变。

## 16. Gate 断言

Roster Alignment Algorithm Gate 只有以下断言全部被 Unit、Integration、E2E、Contract 和 Docker smoke 的相应层级证明后才能为“是”：

- FILE 仅接受 UTF-8 CSV，XLSX 稳定拒绝；
- 导入统计公式成立，至少一个 VALID 才能发布；
- 仅 VALID Entry 进入对齐；
- 学号 trim/uppercase 且保留前导零；姓名 trim + NFC 且不参与自动匹配；
- 冻结同组织同 Semester 全部 ACTIVE Enrollment 最小快照；
- 六类结果按唯一优先级且每个 subject 只分类一次；
- subjectKey、canonical SHA-256 fingerprint 和 `ROSTER_ALIGNMENT_V1` 确定稳定；
- comparisonRevision 单调递增，幂等重放与显式重跑语义可区分；
- 同班并发互斥，失败不发布部分结果；
- Run/Result/Snapshot 不可变，current/superseded 关系不覆盖历史；
- Teacher/Admin/Student 投影满足最小授权与隐私要求；
- 对齐、处置和回滚对 Enrollment/Profile/User 为零修改。

本 Gate 不批准 Roster Ignore、OFFICIAL_API Sync、production retention、Session、Media、Record、Review、Score、Export 或 Full Production。
