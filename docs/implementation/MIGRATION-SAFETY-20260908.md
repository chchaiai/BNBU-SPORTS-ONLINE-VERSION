# 55 项迁移静态检查修复

当前检查器与迁移清单生成器共用显式注册表，覆盖 0001 至 0055。保留逐文件 SHA-256 校验、未知目录拒绝和原有基础迁移约束检查。历史 SQL 与 manifest 均未修改。

V8.1 已有迁移包含约束替换和名单来源改造。检查器仅对列明的迁移识别对应替换，历史主体外键仍拒绝级联删除；注释和字符串不能伪造替换约束。跨 SQL 语句的旧 DROP 匹配已修正，删表、删列、TRUNCATE 和 DELETE FROM 仍被拒绝。

验证：

- `migration-safety-v81-final-20260908.txt`：55 项通过。
- `migration-safety-v81-tests-20260908.txt`：9 项通过，包含未知迁移、校验和变化、破坏性 SQL、伪造替换和历史级联删除的拒绝测试。
- `node backend/scripts/generate-migration-manifest.mjs --check`：通过，生成结果无变更。
- 初次检查与第二次检查的失败分别保留于 `migration-safety-v81-first-20260908.txt` 和 `migration-safety-v81-retest-20260908.txt`。前者误要求历史外键显式书写 RESTRICT，已兼容 PostgreSQL 默认 NO ACTION；后者漏列已有 0051 约束替换，已补入。

此检查是静态防误操作门禁，不是完整 PostgreSQL 解析器，也不能证明任意动态 SQL 安全或迁移的所有业务语义正确。数据库执行证据仍以现有 Docker 迁移与业务回归记录为准。后续新增迁移需更新显式注册表并重新执行检查和数据库测试。
