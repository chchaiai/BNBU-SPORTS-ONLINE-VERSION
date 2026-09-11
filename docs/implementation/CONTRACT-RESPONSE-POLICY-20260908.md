# 停用接口契约响应规则修正（2026-09-08）

基线 d23e0ac8。现行业务旧课程/成绩入口共 16 项明确停用，用户另要求学生注销延期。原检查器无条件要求成功响应，与已验证的拒绝行为冲突。本轮提取 operation-response-policy.mjs：普通接口必须同时声明成功与错误；明确 retired/deferred 操作必须出现在停用登记，并有非空原因，分别声明 403/503，禁止再声明成功响应。仅登记为停用不足以豁免成功要求。

学生注销契约新增 x-availability: DEFERRED 和用户决定的原因；既有 503 FEATURE_DEFERRED 行为未变。旧课程与成绩已有 deprecated/retirement reason，直接接受严格校验。OpenAPI 重新生成，249 操作/handler 对应检查通过。未更改运行时服务或前端布局。

3 项反例测试纳入 tools/backend-contracts 的默认 check：缺错误、普通接口缺成功、无登记、空原因、缺 deprecated、停用却有成功、缺实际拒绝状态均不能静默通过。主契约检查从 407 降为 390，仍退出 1；后续 lint/compatibility/release 尚未执行，日志 contract-response-policy-retest-20260908.txt。

Docker 首轮误用 Node 默认文件并行启动三个共用数据库套件，产生组织唯一键冲突和状态干扰。原始失败保留 docker-response-policy-20260908.txt；进程终止后以 --test-concurrency=1 串行复测。docker-response-policy-retest-20260908.txt：检查器 3/3，client-capabilities/score/teaching-structure 共 23/23 通过，0 跳过/取消，退出 0。真实 PostgreSQL、Nest HTTP 和严格响应 hook。运行源仅文档元数据和检查器变化，因此本轮按受影响入口回归，最新全量仍第十一轮 92/92。

剩余 390：权限编号命名 113、权限登记缺失 113、登记不一致 5、命名枚举不一致 3、内联枚举元数据 155、旧每日唯一记录断言 1。后续按业务/实现逐项修正，不能放宽编号和枚举校验来消除错误。三端当前浏览器复验、业务矩阵和最终交接仍待完成。
