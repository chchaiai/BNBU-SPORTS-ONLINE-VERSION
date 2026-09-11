# 补练撤销后材料与人工审核

2026-09-09，本地隔离 Docker PostgreSQL、Mailpit、MinIO 和 NestJS 真实接口。扩展现有补练 E2E，docker-makeup-media-final-20260909.txt 退出 0，2/2 tests、1 suite、5.10 秒测试时长，不含构建。

总管理员通过接口开启人工审核。学生真实邮件验证码登录，责任教师授权补练，学生开始后教师撤销。已有会话结束，建立草稿后申请上传能力，以签名 PUT 实际传输合成 PNG 字节至 MinIO；匿名读取原图 403；后端 confirm/bind，通过生产 MediaProcessingWorker.processOne 实际读取并验证哈希，媒体达到 AVAILABLE。处理器由测试显式触发，不证明后台调度或重启恢复。

学生提交到 PENDING_TEACHER，教师 VALID 审核，学生回读 VALID；提交和审核同键回放保持原响应。此前结束/草稿重放、越权和新会话拒绝断言继续通过。短会话不足门槛，最终 creditedDurationSeconds=0，不冒充有效学时达标。图片是测试程序生成并以 IN_APP_CAMERA 元数据提交，不证明真实设备拍摄。课程常规截止仍是合成时间夹具。

## 失败记录

- docker-makeup-media-20260909.txt：测试引用 sharp 内部 lib/index.js 不存在，改用包公开入口。
- docker-makeup-media-retest-20260909.txt：上传校验提交已完成，但缺少总管理员开启人工模式，实际 PENDING_AI；补上真实 manual-mode 操作后重跑。
- docker-makeup-media-final-20260909.txt：最终 2/2 通过。未更改后端业务规则。

## 测试依赖及复现

compose.v81-full-integration.yml 新增 integration-media，复用本地已有固定 MinIO 镜像；只加入 integration-isolated 网络，不发布主机端口，/data 为 tmpfs。凭据从已忽略的 .local/v81-sql.env 注入，不写入仓库。补练测试要求 TEST_MEDIA_ENDPOINT/ACCESS_KEY/SECRET_KEY，每次建立随机私有测试桶；服务停止/重建后测试对象不作持久交接数据。

首次先执行该 compose 的 up -d integration-media；run integration-tests 在未指定 --no-deps 时会等待存储健康。保留的历史结果容器不得通过 --remove-orphans 清理。第十九轮 97/97 是之前完整结果，第二十轮另行记录；本次未改变产品网页布局，补练授权网页最小调整仍待答复，真实腾讯 COS 和有效计入运动周期仍待验证。

原始 Docker 日志保留工具行尾空格；源码与 Markdown 另行检查。
