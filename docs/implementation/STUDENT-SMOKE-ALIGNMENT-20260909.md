# 学生 smoke 与现行业务对齐

2026-09-09。上一轮记录的 8 项失败已逐项核对，本轮只修改 student-smoke.mjs，业务代码、UI、协议和数据库未改。

| 原失败 | 依据与修正 |
|---|---|
| 两个 dashboard 夹具缺少 isApiMode | 明确区分合成预览和真实 API 模式；真实模式显示待服务器核验，不能据本地时间断言可开始 |
| 两小时实际计时截断、59 分钟进位 | 学生业务 §6/7 要求保留真实运动，单次考核计入最多 60 分钟；验证暂停后的 190 分钟实际累计、30/45/60 门槛及整分钟，不把未知规则猜为默认值 |
| 旧帮助地址 | 使用现行 `/student/help-articles`；继续验证语言、非分页和正文投影 |
| 运动阶段中的旧默认门槛断言 | 检查已发布课程门槛与当前预计计入显示；上面的行为断言验证门槛/封顶 |
| 两个旧成绩分页测试 | 学生业务 §1 禁止分数；验证不请求 student-scores。分页收集、重复游标和 100 页上限继续用真实存在的本人入班列表验证 |
| 禁止 getActiveSession | 已有服务器会话允许恢复；仍禁止隐式取消和替换，并保留 expectedId 检查与冲突分支 |

初次对齐后剩余一项预计计入函数签名的旧断言，输出保留于 `student-smoke-alignment-first-20260909.txt`；修正后本地 86/86 通过，见 `student-smoke-alignment-final-20260909.txt`。

Docker Node v24.18.0 中复测 86/86 smoke 与 2/2 申请图片规则通过，见 `student-smoke-docker-20260909.txt`。测试代码复制到运行容器 `/tmp/student-smoke-20260909/`，包括学生 js/css、index、package、两份测试和其引用的 Portal OpenAPI snapshot，未替换运行服务文件。执行：

```sh
node /tmp/student-smoke-20260909/frontend/student/student-smoke.mjs
node --test /tmp/student-smoke-20260909/frontend/student/application-proof-rules.test.mjs
```

这些是有替身请求的前端 smoke，不替代真实浏览器、HTTP/PostgreSQL 或云端验收。前序申请真实上传和第 35 次后端 E2E 证据继续有效；下一步仍需完成名单/OCR、通知具体对象定位等全范围剩余项。
