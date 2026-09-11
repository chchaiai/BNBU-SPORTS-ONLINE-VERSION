# 现行业务枚举与每日计入契约（2026-09-08）

基线 0ca0d98e。学生文档第 26/277/289 行明确同日可独立运动多次、每日最多计入一条；Prisma ExerciseRecord.sessionId 为唯一键。移除过时的每日记录占位元数据，协议明确 sessionId 唯一、允许同日独立记录、每日计入上限 1，检查器分别强制这三项。没有更改运行时算法、数据库或历史占位表。

07 枚举登记补 XLSX（教师文档电子名单直接读表），补六类现行公开审核原因及动作限制（教师文档 9.2.1；与 domain/review.ts 对应），移除当前 SystemMode 的 READ_ONLY 并在废弃区说明不自动映射。历史七类审核原因仍用于旧记录读取，新增 V81 输入仍仅接受当前六类；没有把旧原因重新开放给教师。

生成及 249 操作/handler 对应检查通过。主契约检查从 159 降至 155，剩余全部为内联枚举缺少定义归属，仍退出 1，日志 contract-business-enums-retest-20260908.txt。未降低枚举校验，也未为通过检查改变业务枚举值。

Docker 串行运行 exercise-record、v81-system-management、v81-ocr-intake、v81-physical-imports：19/19、4 套件通过，0 跳过/取消，退出 0，约 25.08 秒不含构建。日志 docker-business-enums-20260908.txt。覆盖同日独立提交/材料/人工审核补证/审核原因/进度、系统模式与维护、CSV名单和XLSX体测导入等现有 HTTP 场景；真实 PostgreSQL、严格协议 hook。内存对象存储与模拟 OCR 等测试边界继承专项报告。

构建后仅同步历史 extend-v81-contract 脚本的元数据设置和补充 READ_ONLY 废弃说明；没有执行该历史脚本，当前 OpenAPI 无进一步变化。最新全量仍第十二轮 92/92。继续 155 项内联枚举治理、三端当前浏览器、完整业务矩阵及最终交接；未改 UI/UX 或云端配置。
