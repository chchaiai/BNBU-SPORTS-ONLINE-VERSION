# 运动记录历史读取专项

2026-09-08：docker-record-history-read-20260908.txt 退出 0，Docker 构建、52 项迁移检查和四组基础账号验证通过。本轮验证此前已实现的历史主体权限查询，未改产品源码。

复用现有 seedSubmittedExerciseRecord 建立一条合成已审核有效记录、服务器会话和审核记录。先通过责任教师 HTTP 读取，再事务删除合成学生的当前会话、资料和用户。

- 删除前后记录列表、详情、证据上下文及审核历史投影完全一致。
- 数据库运动记录、运动会话及审核记录全部字段不变；当前用户已不存在。
- 同组织非责任教师与其他组织教师访问详情、证据上下文、审核历史，共 6 个请求均返回 404。

证据上下文没有真实媒体，本次未上传相机材料，也没有通过真实审核动作建立该合成记录；不代表完整运动审核流程。测试直接删除合成账号，不验证注销确认、偏好清理、材料保留、后续纠正及其他历史读取。原有失败未修复，完整三端目标仍未完成。

复现命令：

```powershell
docker compose --env-file .local/v81-sql.env -f tools/local-integration/compose.v81-test.yml run --build --rm -e V81_RECORD_HISTORY_READ=1 backend-startup
```

存档检查：明确暂存7个文件；git diff --cached --check退出2，仅原始Docker日志尾随空格，保留输出并记录未通过。测试服务已停止，卷保留。
