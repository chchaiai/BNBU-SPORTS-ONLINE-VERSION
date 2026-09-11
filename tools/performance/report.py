import json,pathlib,datetime
root=pathlib.Path('docs/performance/evidence-20260911')
rows=json.loads((root/'aggregate.json').read_text())
summaries={p.parent.name:json.loads(p.read_text()) for p in root.glob('*/summary.json')}
history=json.loads((root/'history-ready.json').read_text())['time']
stages=[r for r in rows if r['mode']=='stage']
populated=[r for r in stages if summaries[r['runId']]['started']>history and r['thinkMs']==5000]
burst=[r for r in stages if r['thinkMs']==0]
soak=[r for r in stages if summaries[r['runId']]['seconds']==300][-1]
limit=burst[-1]
def table(items):
 out=['| 活跃 VU | 开始间隔 | 请求数 | 平均 RPS¹ | p95 / p99 (ms) | 错误 | 主机 CPU 平均/峰值 | 最低可用内存 MiB |','|---:|---:|---:|---:|---:|---:|---:|---:|']
 for r in items:out.append(f"| {r['vus']} | {r['thinkMs']/1000:g}s | {r['requests']} | {r['rps']:.2f} | {r['p95']:.2f} / {r['p99']:.2f} | {r['errors']} | {r['cpuAvg']:.1f}% / {r['cpuMax']:.1f}% | {r['availableMiBMin']:.0f} |")
 return '\n'.join(out)
route=summaries[soak['runId']]['byRoute']; route_table='\n'.join(f"| {k} | {v['requests']} | {v['p95']:.2f} | {v['p99']:.2f} | {v['errors']} |" for k,v in route.items())
recovery=json.loads((root/'recovery-http.json').read_text());db=json.loads((root/'db-final.json').read_text(encoding='utf-8-sig'))
text=f'''# 香港当前部署容量测试报告 · 2026-09-11

## 结论

**已实测 200 个独立学生账号持续活跃，目标约 60 请求/秒，维持 5 分钟。** 本轮实际平均 {soak['rps']:.2f} RPS，{soak['requests']:,} 个请求，错误 {soak['errors']}，p95 **{soak['p95']:.2f} ms**，p99 **{soak['p99']:.2f} ms**。场景包含 2,000 条合成历史记录、200 人名单、60 个进行中运动会话，以及教师待审列表。

| 用户关心的指标 | 本次能支持的结论 |
|---|---|
| 稳定承载人数 | **200 个独立活跃账号已实测**；在每人每 5 秒约 1 个业务请求的模型下，约 60 RPS 对应 **约 300 活跃用户**的吞吐预算。这是频率换算，不是实测了 300 个不同账号。建议先以 200 人作为直接验证过的上线规划值。 |
| 极限人数 / 压力 | 20 个不停顿并发可达约 94 RPS；增至 40 个不停顿并发仍约 94 RPS，延迟和超时显著增加。按 5 秒/请求换算约 **470 人的速率需求**即接近本次链路平台；该数字不能作为稳定在线人数承诺。 |
| 可接受与不可接受压力的区间 | 20 个不停顿并发档零错误，40 并发档出现 {limit['errors']} 次超时，教师待审 p95 超过 2 秒。错误出现后停止阶梯，未执行 80–200 突发档。该档已经停止，不继续追求服务失效。 |
| 最先出现的瓶颈 | **公网传输路径的有效吞吐**，证据强；业务响应载荷在两档都停在约 3.23 Mbit/s。当前证据不能进一步确认是 CVM 公网套餐限速、跨境线路还是发压端路径。应用计算能力硬极限尚未测到。 |
| CPU / 内存 / 数据库 | 限制档主机 CPU 峰值 {limit['cpuMax']:.2f}%，Backend 峰值 {limit['backendCpuMax']:.2f}%（Docker 单核口径），可用内存最低 {limit['availableMiBMin']:.0f} MiB；无 OOM、重启、死锁或持续数据库锁等待。没有资源饱和证据。 |

“在线人数”本身不产生固定负载。本报告的人数均指上述请求频率下的活跃用户，不包含静止页面用户，也不等同于同一时刻在途 HTTP 请求数。5 分钟验证是本次短时稳定性证据，不是全天候容量保证。

## 环境与配置

- 外部发压机为当前 Windows 工作站，Node.js HTTPS，正常证书校验、Keep-Alive，明确将正式域名解析到 `43.129.193.7`；请求经过现有 Nginx 和真实 Backend/PostgreSQL。
- 香港 CVM：`ins-kfitq8i6`，主机 `VM-0-13-ubuntu`，2 CPU，约 3,655 MiB 操作系统可见内存，无 swap，根盘约 59 GiB、开始空闲约 39 GiB。数据库地址 `172.19.0.16:5432`，真实版本 PostgreSQL 18.6；交接标称 1 CPU / 2 GiB，未通过本次云 API 再核验托管实例规格。
- 当前发布路径 `/opt/bnbu-sports-production/releases/3957d4249031-continuity`。Backend image `sha256:c332feb284f338de37fd59f7771a03cabd79a0c2cdf7f2c6b6bf7abf67ccd953`，Portal image `sha256:612b35637ce1bf2774b4d7a60b933b8410087041d33409b4bf783a495e218dcb`。
- Backend 单实例，内存限制 1,200 MiB，无 CPU 配额，PIDs 256，请求超时 10 秒；Portal 限制 512 MiB、PIDs 128。Docker 29.8.0；应用只读根文件系统、日志轮换、unless-stopped。
- Nginx 2 个 worker，`worker_connections 768`，API 上游 `127.0.0.1:3000`，read timeout 65 秒；每连接计数同时包含客户端和上游连接，不能直接换算成 1,536 个用户。API access_log 关闭。gzip 开启但未配置 JSON 的 gzip_types。
- PostgreSQL 应用连接池代码及运行镜像均确认 `max:10`，连接获取超时最多 5 秒；DB `max_connections=2048`、shared_buffers=512 MiB、work_mem=4 MiB、effective_cache_size=4 GiB。连接池上限与 DB 最大连接数是不同边界。
- ClamAV MaxThreads=2、MaxQueue=4；OCR disabled。本轮不测试大视频/COS/邮件/OCR并发，不据此推导它们的容量。

## 方法与保护

用户确认了学生读取为主、少量教师读取的典型高峰。默认约 90% 学生请求、10% 教师请求；每个 VU 同时最多发起一个请求。低档短时循环的实际占比见逐路由数据。

第一轮为空历史记录基线，第二轮每人 10 条历史记录（8 VALID、2 PENDING_TEACHER，共 2,000 条），有对应 review/workflow/credit projection。历史是明确标记的合成数据库夹具，不是伪称真实运动或上传验收。突发与稳定复测前，再通过真实 API 启动 60 个合成运动会话，教师查询采用 `reviewResult=PENDING`。

硬限制为每轮最多 200 VU、150 RPS、600 秒、单请求 6 秒。主机 CPU 连续 15 秒高于 85%、可用内存低于 500 MiB、后端内存超过 85%、健康/容器/锁等待异常、监控失联立即停止；窗口错误率 >1% 或连续两窗口 p95>2秒停止；每档结束后任何错误也阻止继续升压。未放宽阈值以继续冲击服务。

主机与 DB 约 5 秒采样，发压端保存每请求状态/延迟/字节数，10 秒汇总。另有低频内部健康/业务探针；其请求不计入外部业务 RPS。独立 DB 观察容器限 256 MiB、0.5 CPU、单 DB 连接，观察进程的实际资源使用记录在原始数据中。

## 测试数据

### 有 2,000 条历史数据的阶梯

{table(populated)}

200 人档的 1 次 6 秒超时约占 0.04%，使阶梯停止。该时段后端所有已收到请求均成功，记录接口最长处理 21.25 ms；客户端记录请求数比后端对应计数多 1。随后预检 20/20 成功。保留该失败，判为疑似传输路径丢失，未武断归因某个具体网络设备。

### 不停顿突发阶梯

{table(burst)}

20→40 并发时平均吞吐只从 93.95 增至 94.13 RPS，业务载荷分别约 3.231/3.232 Mbit/s，p95 从 527.67 增至 1,316.30 ms；40 档 p99=2,291.27 ms，4 次超时（约 0.136%）。教师待审列表 p95=2,275.70 ms。发压上限 150 RPS 尚未达到，因此这个平台不是令牌桶限速导致。

### 5 分钟稳定复测

{table([soak])}

实测峰值在途 HTTP 数为 {soak['peakInflight']}，并非 200 个请求同时在途；观察到最高 10 秒窗口 {soak['windowRpsMax']:.1f} RPS。主机 CPU 平均 {soak['cpuAvg']:.2f}%、峰值 {soak['cpuMax']:.2f}%，可用内存最低 {soak['availableMiBMin']:.0f} MiB。

| 请求类别 | 请求数 | p95 ms | p99 ms | 错误 |
|---|---:|---:|---:|---:|
{route_table}

¹ 平均 RPS 使用整个阶段实际经过时间，包含开始错峰和最后在途/等待退出，因此略低于设置频率。逐 10 秒窗口提供更直接的稳态到达量；原始数据同时保留首轮 TLS 建连成本，未移除失败样本。

### 写请求

1、5、10、20 用户分别执行 start→pause→resume→cancel，共 144 次真实 HTTP 写请求，全部成功。20 用户档实际峰值 11 个在途请求、80 次写入、约 30.11 RPS，p95=515.52 ms；只证明小规模事务写入通过，未测出写入极限。没有真实邮件、文件上传或教师代审真实记录。

## 瓶颈证据与优化优先级

1. **先排查公网有效吞吐。** 两个不同并发档的载荷吞吐平台一致，大响应先变慢，轻请求仍较快；40 压力档后端日志无 5xx、无 >1 秒处理，记录接口最长 23.55 ms。主机/DB资源未饱和。另在约 60 RPS 复测期间，通过本机回环访问同一 HTTPS Nginx，30/30 请求成功，学生记录最多 25.32 ms、教师待审最多 22.87 ms。以上支持公网传输瓶颈，但没有证明哪一段线路限速。确认云控制台公网带宽配置，并用同地域独立发压机交叉复测；带宽升级属成本决策，应以复测为依据。
2. **减少 JSON 传输量。** 学生记录本轮约 11 KiB/页，教师 20 条列表更大；评估 JSON gzip、必要字段投影、分页加载。验证实际 Content-Encoding、CPU开销与弱网收益后再发布。不要把缓存未授权的个人数据作为优化手段。
3. **修正 UUID 文本转换查询。** `v81-record-projection.ts` 中 `record_id::text IN (...)` 导致顺序扫描；只读 EXPLAIN 对照中，原形约 1.008 ms，类型匹配约 0.297 ms并利用工作流主键索引（本轮单次对照，不是统计基准）。进度查询中 enrollment_id 文本转换也应评估。当前尚不是最先触达的瓶颈，数据增大后风险会上升。
4. **补齐观测后再调池/实例。** 暴露连接池 total/idle/waiting、获取等待时间、请求阶段耗时和事件循环延迟；配置可检索的 Nginx request_time/upstream_response_time/bytes_sent。取得现有托管监控读取权限后补 DB CPU/I/O；按发布流程评估 pg_stat_statements。当前没有证据支持直接扩大连接池、增加 Backend 副本或升级 CPU。

应用日志的 durationMs 是应用处理记录，不能替代客户端端到端延迟。连接池 10 条连接全建好也不等于 10 条全部繁忙；本轮活动连接采样与等待事件没有显示持续排队。

## 恢复与数据保留

本轮结束后通过正常 API 取消所有剩余合成运动会话，停用本轮两个隔离组织账号并增加 tokenVersion。最终本轮主组织 active_users={db['fixture'][0]['active_users']}、open_sessions={db['fixture'][0]['open_sessions']}；保留 2,000 条合成历史及审计事实。未删除真实记录、数据库、COS 或容器卷。

公网恢复检查 {sum(r['pass'] for r in recovery)}/{len(recovery)}：学生页、教师页、既有分发站、两站 readiness 正常；停用账号旧令牌被拒绝。发布路径、Backend/Portal image、startedAt、restartCount 和健康状态与基线核对见 recovery-state.json。DB观察容器已停止，业务容器保持健康。

## 适用限制和复测

- 师生模型、当前数据量与网络路径是结论的一部分。长期历史、全校多课程、集中登录/OTP、媒体上传/扫描、下载大文件、浏览器首屏资源和手机真机都可能更早遇到其他限制。
- DB CPU 云 API 返回 UnauthorizedOperation；pg_stat_statements 未安装；应用池 waitingCount 未暴露。未扩大 IAM 权限或更改线上配置。数据库端活动连接每 5 秒采样，可能错过毫秒级等待。
- 这次测到的是当前公网请求路径的容量平台，**没有测到 Backend 或 PostgreSQL 的计算硬极限**。精确“最大同时在线人数”仍取决于请求频率与客户端行为。
- 完整复测步骤在 [工具说明](../../tools/performance/README.md)。先固定同一数据规模/请求比重/发压位置，对旧稳定档重复，再单独改变一项优化，检查 p95/p99、错误、吞吐和资源。使用新的合成批次，不重新激活本轮旧账号。异常后先恢复核验再降档复测。

## 文件与参考

- [方案与执行调整](PLAN-20260911.md)
- [阶段汇总 CSV](evidence-20260911/stages.csv)、[汇总 JSON](evidence-20260911/aggregate.json)
- [性能曲线](evidence-20260911/capacity.png)
- evidence 目录各批次含 summary.json、requests.jsonl、windows.jsonl、monitor.jsonl；另有配置快照、DB采样、失败日志摘要、回环对照、恢复证明与 SHA256清单。
- [PostgreSQL 活动统计说明](https://www.postgresql.org/docs/current/monitoring-stats.html)、[node-postgres pool 指标](https://node-postgres.com/apis/pool)、[Nginx 连接计数说明](https://nginx.org/en/docs/ngx_core_module.html)、[腾讯 PostgreSQL 监控指标](https://cloud.tencent.com/document/product/248/45105)。

本报告和工具精确路径本地 Git 存档，未推送。测试未修改或发布业务代码及线上服务配置。
'''
pathlib.Path('docs/performance/REPORT-20260911.md').write_text(text,encoding='utf-8')
