# 结算后待办写入保护

日期：2026-09-08 13:53。

名单核对及差异状态变更新增组织锁与结算检查。OCR 创建识别任务/重试在写入范围检查中拒绝已结算课程，读取仍保留。体测 CSV/XLSX 批次创建、修改行、确认行也执行结算检查。权限检查先于结算检查；既有幂等回放保留原处理顺序。

## Docker 验证

- docker-settlement-pending-guards-first-20260908.txt：体测导入 HTTP 专项通过，含原件、历史、CSV/XLSX、行确认、并发与学生回读，退出 0。
- docker-settlement-pending-specialized-20260908.txt：Serializable 回滚事务中生成合成结算报告后，真实名单核对服务和体测导入服务均拒绝操作，体测批次数不变；此前成员、成绩、体测及结算命令专项一并通过，退出 0。幂等外层为事务适配器，不能称作正式结算 HTTP 验收。
- docker-settlement-pending-ocr-20260908.txt：OCR 任务、重试、草稿、确认、权限与原件回归通过，退出 0；识别提供方为合成响应。
- docker-settlement-alignment-unit-first-20260908.txt：旧模拟器对所有 SQL 返回 acquired=true，新查询被误认作结算报告，1 项失败。保留原日志。
- docker-settlement-alignment-unit-retest-20260908.txt：按组织锁、结算报告和 advisory lock 分别返回结果，未知 SQL 直接报错；3 项单元测试通过，退出 0。

本轮没有新增数据库迁移、协议操作或前端布局变更。所有测试进程已结束，持续浏览器服务未在本轮重建。原始 Docker 日志保留工具空白；源代码和手写文档单独检查。

## 交接

下一步优先完成旧事实纠错与更正版报告同事务联动，再开放正式结算协议、幂等端点和报告回读/导出。现有结算内部服务仍未开放 HTTP，ready 保持 false；全写入路径审计与三端完整业务验收尚未完成。缺注册/体测的结算政策仍待业务答复，其他技术工作继续。
