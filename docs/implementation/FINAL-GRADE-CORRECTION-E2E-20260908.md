# 结算后最终成绩更正统一 E2E（2026-09-08）

在v81-settlement.e2e.test.ts的真实结算确认、报告读取和学期切换后，接入既有成绩更正探针。初始规则、名单及身份是隔离库夹具，正式报告和归档通过真实HTTP形成；探针旧日志中的prepared wording不能替代这个明确起点。

验证归档后责任教师将最终成绩更正为98、追加报告及成绩版本，同键重放不重复、新key旧版本409；其他教师404、管理员与学生403、空原因与额外note422。无原成绩或无结算报告均409且不追加。数据库触发器注入新版报告写入失败，500后成绩及审计完整回滚；移除触发器后同键重试成功。原报告规范文本和SHA256不变，新报告结构严格校验，学生结果不含finalGrade/gradeVersion/correctionReason。普通成绩写入仍409；两次同版本更正并发仅201/409，报告仅增加一版。

首轮：旧探针无报告夹具错误假定教学班学期，触发外键；改为读取教学班实际semesterId。复测一：故障注入500漏声明；补充correctV81FinalGrade InternalError并重新生成协议，静态parity249通过。复测二：套件1/1通过。三份日志docker-final-grade-correction-e2e-first-20260908.txt、docker-final-grade-correction-e2e-retest-20260908.txt、docker-final-grade-correction-e2e-retest2-20260908.txt全部保留。

允许探针运行的数据库仍仅v81_runtime_test或明确确认可重置的bnbu_sports_test。未更改业务实现或UI，未操作云端。其他体测更正和三端整体验收继续。
