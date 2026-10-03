# 课程目录运动要求修复 — 2026-10-02

## 原因与修复

上一轮前端上线了课程运动要求展示，但线上后端模块仍是旧版本，未返回 minimumMinutes、maximumMinutes、weeklyLimit、dailyLimit。数据库中的已发布课程规则存在。

本次仅替换线上镜像中的 v81-admin-course-directory.js，将源代码已有实现接入运行环境。读取已发布规则；旧规则的最长时长沿用现有业务的 COALESCE(maximum_minutes, GREATEST(60, minimum_minutes)) 语义。

## 验证

- 目录模块单元测试 1/1 通过；后端 TypeScript 检查通过。
- 使用线上数据库只读事务验证 44 个课程，42 个已发布、2 个未发布；四项字段与存储规则完全一致。
- 去除新增四项字段后，新旧目录响应严格一致；非管理员访问被拒绝。
- 部署后重复运行验证通过；学生端、教师管理端页面和就绪接口均返回 HTTP 200。
- 线上页面点击“刷新数据”后，44 张规则卡中“暂未提供”为 0，“未发布”为 2。
- 用户标出的 Football Class 1001 显示最低 30 分钟、最长 60 分钟、每周 3 次、每日 1 次。
- 浏览器截图服务两次返回 Unable to capture screenshot，因此页面验证证据采用实际 DOM 读取结果。

## 发布与回滚

- 发布目录：/opt/bnbu-sports-production/releases/course-requirements-20261002
- 前一版本：/opt/bnbu-sports-production/releases/checkin-ui-final-20261002
- 部署结果：evidence/course-requirements-20261002/deployment.json
- 运行文件变化 1 个；数据库迁移 0，业务数据写入 0；Portal 容器保持原版本。
- 回滚命令：`sudo python3 /home/ubuntu/course-requirements-20261002/deploy.py --rollback`

本次验收覆盖课程目录字段与现有响应兼容性，以及线上健康检查。
