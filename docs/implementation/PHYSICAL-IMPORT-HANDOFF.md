# 体测导入后端交接草稿

本记录为进行中的模块说明，不是整体项目验收或最终 Git 存档。

## 接口与数据

责任教师按课程创建 CSV 或 XLSX 草稿。CSV 接口为 `POST /class-sections/{classSectionId}/physical-imports`；XLSX 接口在该路径后加 `/xlsx`，请求包含 `fileBase64` 和明确的 `sheetName`。文件上限 1 MiB、1000 行；本地应用请求体上限为 2 MiB。

同课程 GET 列表支持 `limit`、`beforeId`，显示总行数、确认数及待处理数。`GET /physical-imports/{importId}` 返回最新草稿与疑点；`GET .../source` 返回经过摘要校验的原件。CSV 返回 `csv`，XLSX 返回 `fileBase64`、`sheetName`，两者均包含 `sourceSha256`。

`POST .../revisions` 以 `rowNumber`、`expectedVersion` 和五个原始字段追加行修订；同路径 GET 用 `rowNumber`、`limit`、`beforeVersion` 查询历史。`POST .../confirm` 接受 `selections`，每项为行号、预期草稿版本及预期正式结果版本。

确认重新检查当前成员、项目和草稿疑点。选中行任一失败，整批正式结果、通知与确认关联回滚。未选中行继续待处理；确认行禁止再次修订，正式数据纠正使用原始体测追加接口。

数据库迁移 0031 保存正式原始结果，0032 保存草稿及确认历史，0033 保存原件类型与工作表。原件位于私有对象存储，摘要按上传字节计算；修订不覆盖原件。

## 已有本地证据

- `docker-physical-xlsx-api-20260907.txt`：CSV/XLSX 创建、修订、部分确认、回滚、学生回读、原件及历史查询。
- `docker-physical-xlsx-worker-20260907.txt`：编译后的线程解析、超时、并发上限和名额释放。
- `docker-physical-shared-transaction-regression-20260907.txt`：原始体测与免测共用写入规则回归。

全部采用合成账户和材料，不能替代真实学校文件、腾讯 COS 或浏览器验收。

## 未完成事项

- 现有教师页面无体测导入入口；无测试日期输入，先前业务问题仍待用户决定。
- 当前年级来源未确认，内部换算表的正式结果历史绑定尚未完成。
- OCR 识别、原图疑点及人工核对流程尚未实现。
- ZIP 展开预算、worker 外部内存约束、批量规模验证和孤立对象清理仍待完成。
- 当前 XLSX API 用 Base64 JSON；未实现 multipart 文件入口。
- 旧本地 CSV 批次没有原件，不能重建为原始文件冒充保存成功。
- 全部权限/维护/归档/并发组合、三端全范围验收和最终本地提交仍未完成。
