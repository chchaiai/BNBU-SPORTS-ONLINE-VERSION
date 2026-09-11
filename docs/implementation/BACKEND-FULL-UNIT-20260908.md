# 后端完整单元与 XLSX 原对象修复（2026-09-08）

完整 Docker `npm test` 首次 242 项中 241 通过、1 失败，见 `docker-backend-unit-full-first-20260908.txt`。失败位于 v81-roster-xlsx 的输入不变断言：SheetJS 给 Buffer 增加 chk/l/read_shift/write_shift 解析状态属性，原始字节未发现变化。该断言有意义，未降低或删除。

readRosterXlsx 先校验原有大小/文件头，再用 Uint8Array.from 复制输入交给解析库，防止调用方的原文件对象被污染；解析业务规则及返回结构不变。代价是解析时额外持有一份输入字节，仍受既有 100 MiB 输入限制。

修复后完整 Docker 单元测试 242/242 通过，48 suites，退出 0：`docker-backend-unit-full-retest-20260908.txt`。

实际 HTTP 回归 `docker-roster-xlsx-parser-copy-20260908.txt` 退出 0：XLSX multipart 上传、MinIO 原文件、PostgreSQL 确认、显示格式/工作表、同键重放、源文件摘要篡改拒绝、教师范围、缺少工作表、501 行拒绝和当前快照保留通过。

原失败证据保留。仅本地 Docker 合成数据，未修改 UI/UX 或云端。完整后端集成/安全层、Draft 协议诊断与三端业务覆盖继续；不能把单元全绿当作全范围完成。
