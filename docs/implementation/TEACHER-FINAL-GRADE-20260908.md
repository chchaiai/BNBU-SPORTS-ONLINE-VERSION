# 教师最终成绩网页接线验证（2026-09-08 22:11）

用户明确允许在既有成绩弹窗内容区增加最终成绩输入并改为保存成绩。未修改 CSS、页面结构或弹窗尺寸配置。

真实模式移除旧自动算分写入调用，读取并显示 finalGrade；未录入学生可录入，整数范围使用 PostgreSQL INT，不限制 0–100，不提供备注。保存追加草稿，发布追加发布版本，保留历史，内部成绩不向学生披露。请求包含服务端版本和按请求内容复用的幂等键，并限制重复点击。失败刷新服务端数据，保留错误供处理。

验证：
- portal-final-grade-typecheck-final-20260908.txt：直接 tsc --noEmit 通过；不是完整 Portal 发布门禁。
- grade-browser-save-publish-20260908.txt：真实 Edge 页面通过本地 Docker 后端验证小数拒绝、整数 123 草稿保存（版本 1）、发布（版本 2）、刷新回读；未调用旧 student-scores。
- 测试使用既有 synthetic 学生/教师与本地 PostgreSQL，保留该学生的测试成绩历史。未连接腾讯云。
- grade-browser-controls-20260908.txt：初次测试脚本生成因 Python 默认 GBK 解码失败而未运行；显式 UTF-8 后恢复，保留失败记录。
- grade-browser-controls-retest 与 grade-browser-course-control 记录默认课程无学生和实际课程选择控件诊断。最终测试明确选择 fixture 课程。

剩余：本轮尚未补充浏览器版本冲突、响应丢失重试、多学生部分发布及英文文案验证；教师进度值仍需后端真实投影接线；三端总体目标继续，不能据此宣告全部业务验收完成。此前 Docker 全量 92/92 是后端历史基线，不替代这些网页验收。
