# 网站访问慢排查与优化：2026-09-28

完成时间约北京时间 18:57。对象为香港 CVM 43.129.193.7 / ins-kfitq8i6，以及学生、教师、VerityAI、知识库站点。

## 结论

两个故障窗口没有出现后端已完成请求普遍耗时很长的证据。结合原始主机监控，持续 CPU、磁盘、出口或后端整体阻塞的可能性降低。公网链路、客户端网络与 TLS 等待仍需故障现场证据，当前不能确认唯一根因，也不能宣称本次已彻底消除故障。

本次已上线两项改动：修正记录投影查询的 UUID 比较；补齐 Nginx 请求总耗时和上游各阶段耗时。当天此前已上线的静态资源压缩、缓存继续有效。

## 历史日志证据

原始监控表未标时区；本次服务器确认 +08:00，日志查询明确使用北京时间并转换应用日志中的 UTC。

| 窗口 | 后端完成请求数 | p50 | p95 | p99 | 最大值 | 5xx |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 9 月 27 日 16:00–18:00，不含 18:00 | 6222 | 3 ms | 25.83 ms | 174.93 ms | 10000.11 ms | 0 |
| 9 月 28 日 15:30–16:31，不含 16:31，包含 16:30 整分钟 | 2134 | 3.39 ms | 77.83 ms | 166.61 ms | 1083.90 ms | 0 |

- 大于等于 1 秒的请求分别为 25、2 次，均为 confirmMediaUpload。27 日部分上传确认约 3–4 秒，最高 10 秒。上传确认依赖对象存储等服务，应另行拆分其等待阶段；本次未改变媒体验证规则。
- 对应 Nginx 现存 access.log 分别有 9002、2023 条，499 为 25、3 条，均无 5xx。旧日志未记录耗时，且体育 API 原配置为 access_log off，所以这些入口统计并不覆盖全部业务请求。
- 以上应用耗时来自 http_request_completed，不能覆盖尚未完成、未到达应用或 TLS 建连失败的访问。
- 发布前后端容器自 9 月 25 日 14:06:57 运行，RestartCount=0、OOMKilled=false；内存约 779 MiB / 1200 MiB。内核查询未返回该时段 OOM 记录。这些容器状态为检查时快照。
- 27 日 15:18:00 与 15:18:33 有 Nginx reload；Docker journal 在 15:18:21 与 15:18:27 记录知识库数据库、应用容器接入网络。该活动与主机资源突升时间一致，但不足以证明随后两小时的访问故障由此引起。

## 已上线优化

### 记录查询

源文件：backend/src/modules/v8/v81-record-projection.ts。将 w.record_id::text 与文本参数比较改为 UUID 列与参数::uuid 比较，保持参数化。

生产库 READ ONLY 事务内核对原查询与新查询，单条和 30 条结果一致：

| 样本 | 原查询 | 新查询 | 计划变化 |
| --- | ---: | ---: | --- |
| 1 条 | 1.071 ms | 0.086 ms | workflow 与 credit 使用主键索引 |
| 30 条 | 1.365 ms | 0.597 ms | workflow 使用主键索引；credit 仍由优化器选择顺序扫描 |

这是当前数据、缓存状态下的少量样本，不能推算整站加速倍数。候选和上线后均捕获实际运行模块生成的 SQL，再执行结果一致性核对。

发布基于当时线上 checkin-discard-20260928 的固定镜像，只替换一个运行时 JS 文件；保留其余线上内容。新目录 /opt/bnbu-sports-production/releases/query-index-20260928。未执行数据库迁移，教师前端容器保持原 ID。

验证：本地后端单元测试 347/347；TypeScript 检查通过；候选 JS 语法通过；实际运行 SQL 单条/30 条一致；两个业务入口和两个 readiness 均返回 200；后端 healthy。

### 请求耗时记录

配置保存请求总耗时、上游连接/首字节/响应耗时、状态码、站点、粗粒度路由类别、HTTP 版本和连接复用次数。日志不含 IP、原始 URL、查询参数、身份标识、Cookie 或授权头。字段依据 [Nginx 官方日志说明](https://docs.nginx.com/nginx/admin-guide/monitoring/logging/)。

- /var/log/nginx/request-timing.log，32 KiB 缓冲、5 秒刷新。
- 覆盖继承全局日志的站点，并显式启用体育 API 三处原关闭的日志。
- 使用已有每日轮换、保留 14 份及压缩配置。
- 语法检查通过；实际 API 日志已出现 request_time 与 upstream_response，四个首页和两个 readiness 验证通过。
- 此项提高后续定位能力，本身不构成网络提速或告警系统。未新增周期任务、自动通知或多地监控。

### 压缩与缓存复核

此前 http-optimization-20260928 的 gzip、学生资源重新验证缓存仍有效。最终 HTTPS 检查 api.js 返回 Content-Encoding: gzip、Vary: Accept-Encoding、Cache-Control: public, no-cache。

## 公网与本机对照

服务器本机经真实域名 TLS、连接 127.0.0.1 的验证：首页约 4–11 ms，体育 readiness 约 45–47 ms。

桌面上线后四个站点各 3 次，总计 12 次均 200，耗时约 0.52–2.06 秒。常规桌面探测连接地址为 198.18.0.x，说明涉及本机代理/虚拟网络路径，不能把该结果当作校园网直连证据。另一次指定源站 IP 的学生首页请求为 200、约 0.67 秒；系统级网络代理仍可能参与。

前后少量探测存在明显网络抖动，本次没有建立同网络、同负载的整站性能改善幅度。下次报障需同一设备同一时间对照校园网与手机流量，记录具体地址及 DNS、连接、TLS、首字节和下载耗时，再与新增日志对齐。

## 回滚

数据库查询回滚（脚本先检查当前目录和镜像，恢复旧应用并验证）：

```sh
sudo python3 /home/ubuntu/query-index-20260928/deploy-query-index-20260928.py --rollback
```

请求日志回滚（检查配置仍与本次安装摘要一致，拒绝覆盖后续改动）：

```sh
sudo python3 /home/ubuntu/enable-request-timing-20260928.py --rollback
```

配置备份 /opt/bnbu-sports-production/backups/request-timing-20260928；旧应用目录 /opt/bnbu-sports-production/releases/checkin-discard-20260928，固定旧镜像保留。失败自动回滚代码已准备；正常上线后未人为执行服务切换回滚演练。

## 可复核资料

- evidence/access-incident-20260928/：精确窗口应用聚合、查询计划对比、公网前后探测、候选及部署结果。
- tools/production/enable-request-timing-20260928.py：配置变更、验证及条件回滚。
- tools/production/deploy-query-index-20260928.py：固定镜像窄范围发布。配套 tools/production/verify-query-index-20260928.mjs 上传到 WORK 目录时命名为 verify-candidate.mjs。
- 未创建 Git 提交；保留工作区已有其他变更。
