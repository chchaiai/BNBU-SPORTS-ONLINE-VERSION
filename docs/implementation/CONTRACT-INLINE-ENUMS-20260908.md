# V8.1 内联枚举登记与校验（2026-09-08）

基线 a23c1c1e。补 43 个命名定义，已有 RosterFileFormat、SystemMode、ReviewReasonCode、ReviewResult 等定义继续复用；共 155 个具体字段绑定登记在 docs/backend-contracts/v81-enum-bindings.json。语言代码、图像 MIME 类型标为传输限制并记录原因，其余分类、流程状态及数值选项关联明确命名枚举。07 文档补现有 wire 值和登记标识，不生成 UI 或翻译资源、不改变现有值。既有小写值与数值选项明确保留，避免格式治理改变接口行为。

新增 enum-subset-policy 检查引用是否存在、成员是否属于所引用域、数值是否保持数值类型，按 JSON Schema type 处理 null。3 项枚举反例测试与既有 3 项响应规则测试共同纳入默认契约检查。文档解析支持显式登记的小写和数值成员，仍逐项核对定义值及唯一 i18n 登记标识，没有取消双向一致性。

首次 AST 修改遇到 YAML alias 路径不可直接 setIn，在写文件前失败；改为显式解析别名节点，保留原文件结构。首轮强化检查报两个 sourceKind null 不属于非空来源枚举。逐值复核确认原字段未声明 type，enum 已允许 null，最初“字符串与 null 冲突”的判断不正确；检查器修正为无 type 时遵循 JSON Schema，并为两处字段补显式 string/null。enum-semantic-comparison-20260908.json 证明除新增定义/归属元数据外，仅这两处显式类型声明变化，全部既有枚举值保持。

新增 OCR 套件在尚无名单基准时断言 sourceKind/confirmedRosterId 均为 null，后续上传、草稿、确认、CSV切换和体测链照常执行。Docker 首轮 6/6 检查器、1/1 OCR完整场景通过；修正检查器无 type 语义后再次 Docker 6/6、1/1 通过、退出0，日志 docker-enum-roster-20260908.txt 与 docker-enum-roster-retest-20260908.txt。内存对象存储和模拟 OCR 边界继续适用；新增空状态断言不是外部云服务验收。

基础 check-contract 现在通过：212路径、249操作、387 schema、86命名枚举/325成员、249权限登记、154错误码；生成及 handler parity 通过。首次失败、修正和最终日志为 contract-enum-first/retest/final-20260908.txt。完整 npm contract:check 仍失败于随后系统模式响应检查，日志 contract-enum-full-retest-20260908.txt；lint、兼容、发布检查未到达。

后续已取得解析后的 51 项缺少503声明索引 system-mode-response-inventory-20260908.json。现有 system-mode 检查器只识别单引号状态键，有格式误判；必须先修正解析，再核对每个接口实际维护守卫及豁免，不能把全部缺项直接等同于维护禁止。最新全量仍第十二轮92/92；三端浏览器、全业务矩阵和最终交接继续，未改UI或操作云端。
