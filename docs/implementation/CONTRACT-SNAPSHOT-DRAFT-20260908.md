# 发布快照换行与草稿兼容性核对（2026-09-08）

基线 fe18b7f1。2.0.11 已发布快照工作区 SHA 为 6019d1a0c5480a831e66ef6c0e9abd080465114a7a18f5eb191da6e65fd38678；Git blob 与 CRLF 转 LF 后均精确为登记的 c3bdba5999404ea5c58b48407f582ed7b6f19fe955b793f5dfba78303ae9edb1。确认只因 Windows 换行转换，并非发布内容变化。仅将这一明确路径固定 text eol=lf，工作文件恢复原始LF；未改登记SHA或历史正文，Git内容差异为零。证据 published-snapshot-line-ending-check-20260908.json。

完整契约命令复测通过此前阶段后，下一失败为 Candidate version must be 2.0.12-contract, got 3.0.0-v81-local-draft，日志 contract-snapshot-retest-20260908.txt。现有 release-config 是历史已发布 2.0.12 流程；本轮未篡改发布状态，也未把当前草稿提升为发布。完整发布检查仍未通过。

使用现有 compareContracts 导出函数直接比较哈希已核实的 2.0.11 快照与当前草稿，保存 local-draft-compatibility-20260908.json：BREAKING 52、REVIEW_REQUIRED 35、NON_BREAKING 26。未注入例外、未批准任何差异。52 项中包括16个旧停用接口成功响应移除、4项权限元数据变更及schema/枚举差异；不能仅因部分符合业务决定而批准全部。此报告是当前对历史基线的技术差异，不代表实际网页已经断裂或兼容，也不代替浏览器和业务规则验证。

Docker以当前构建运行原兼容性夹具，7/7通过、退出0，日志docker-compatibility-snapshot-20260908.txt。测试涉及方向分类、状态移除、权限变更、精确重大版本例外与漂移拒绝；没有重跑后端业务，最新全量仍第十二轮92/92。本轮为换行、证据及交接变更。

下一步继续按当前草稿和三端真实调用核对业务影响、刷新浏览器联调、更新全范围业务验收矩阵。发布配置不适用的问题保留为正式契约交接事项；整体目标未完成。未修改UI、产品运行逻辑或云端状态。
