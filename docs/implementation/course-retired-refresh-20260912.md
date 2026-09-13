# 删除课程后教师页面刷新失败

## 根因

删除课程会结束课程关系并保留学生打卡历史。教师课程列表已排除被删除课程，学生投影也只加载可见课程；但 loadSubmittedCheckins 仍加载教师有权读取的全部历史记录。两者范围不一致触发 RECORD_STUDENT_PROJECTION_MISSING，外层 catch 清空整个工作台，因此刷新仍失败。此前删除验收检查了删除响应、幂等与学生历史，没有检查删除后的工作台刷新，遗漏了这一故障。

## 修复

- loadSubmittedCheckins 必须接收当前可见教学班 ID，在请求记录详情前按教学班范围筛选；空课程列表直接返回空记录。
- 身份关联检查改为“教学班＋学生”组合，避免同一学生在其他课程的身份掩盖关联缺失。
- 历史数据及访问权限不变；本次没有数据库迁移，也没有删除历史记录来规避错误。

## 验证

- 云端旧版本：独立合成教师账号刷新复现相同错误，日志 `.local/course-retired-reproduce.log`。
- 真实本地 Docker：实际删除合成课程后连续刷新两次，其他课程正常显示、无身份关联错误，日志 `.local/course-retired-local-retest.log`。
- 两项自动回归：空课程不请求历史；已删除课程的同学生历史被排除，同时可见课程待审核记录和凭证正常加载。
- Portal 完整类型检查与生产镜像构建通过。首个本地测试因开发服务已停止未连接，启动后通过；第二项测试补全真实审核状态字段后通过。

## 发布记录

源码存档 `a6c9795a`。镜像 `bnbu-portal-production:course-retired-20260912`，ID `sha256:dcfa3bbcbf332c182a4cf334f5132b7c1a683df52f436f4bb74143c62c39c27c`。发布仅切换 Portal，复用已部署 Backend 和数据库；发布脚本校验镜像及归档哈希，健康失败恢复上一 Portal。

线上已发布至 `/opt/bnbu-sports-production/releases/course-retired-20260912`，服务健康通过。同一个修复前报错的合成教师账号，修复后连续刷新两次通过；云端截图视觉检查确认其他课程正常显示且无错误提示。日志 `.local/course-retired-cloud-final.log`。上一个 Portal 发布为 `exercise-limits-20260912`，可按发布脚本切回；本次无数据库变更。

脱敏证据保存于 `evidence/course-retired-20260912/`。源码及交接均本地提交，未推送。
