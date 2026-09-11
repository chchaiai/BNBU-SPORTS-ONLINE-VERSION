# 运行日志归档统一 Docker E2E（2026-09-08）

新增v81-runtime-archives.e2e.test.ts，真实Nest HTTP、PostgreSQL与5秒轮询后台worker。输入为容器临时目录中明确标注的合成结构化HTTP日志，含本组织及异组织各一行、敏感标记字段；对象存储使用MemoryObjectStorage。

调用归档创建与同键重放，轮询真实任务成功，申请下载凭据并获取ZIP，核对MIME、no-store、字节数、SHA256、manifest与runtime.ndjson记录数，全部记录属于本组织且敏感标记剔除。匿名下载401、教师403。取消后原下载链接404，归档不再可下载。

首轮严格协议hook发现取消后下载404未声明；补充downloadV81RuntimeArchive的NotFound并生成协议产物，静态parity249通过，Docker复测1/1通过，本组织归档记录为1条。首轮日志docker-runtime-archive-e2e-first-20260908.txt；复测docker-runtime-archive-e2e-retest-20260908.txt。首轮套件标题沿用了体测测试架构名称，复测已改为归档，不影响测试内容。

此轮不能证明真实生产HTTP日志采集、COS对象读写、已取消对象物理清理、诊断文件关联及分管理员动态权限/下载凭据过期全部通过；这些有既有独立探针但仍需统一验收。未改UI，未改业务数据，整体目标继续。
