# 教师浏览器联调

## 2026-09-08 10:32 建课与发布实测

10:38 补充：首次发布 ACTIVE 课程时，在规则事务中开放入班并追加 ENROLLMENT_OPENED 事件。browser-course-invite-initial-20260908.txt 原始失败为发布后开关仍关闭，邀请返回 409；browser-course-invite-open-retest-20260908.txt 已通过浏览器生成邀请码。browser-course-publish-open-atomic-20260908.txt 还核对容量拒绝时入班仍关闭、发布成功后开关开启。规则发布与开放入班原子，时间窗设置与规则发布整体仍是两步。发现“撤销邀请码”实际替换新码，独立撤销及宽限终止仍待接线和专项验证。

教师通过原有新建课程弹窗创建真实课程和教学班，UUID v7、当前组织/学期/责任教师绑定、默认禁止入班和打卡、事务和幂等保护。接口为 POST /teacher/courses。页面对未发布课程缺少 progress-target 的 404 按待配置处理，显示原有 10h+10h 表单初值；这些初值不是已发布规则。发布前提示启用允许打卡。确定性 422 拒绝后重新读取教学班版本，允许修改内容再次提交。

browser-course-validation-recovery-20260908.txt 四项 PASS：建课 UUID v7 和同键重放；实际表单配置并发布、刷新后模板锁定；新键改写已发布规则返回 409；不足完成目标的日期安排返回 422，修改后成功发布。真实 Edge 浏览器、Docker 后端和 PostgreSQL；仅合成账号与业务数据。browser-course-create-publish-final-20260908.txt 另有不含故意失败的成功链路。

修复过程原始失败均保留：编码小写违反数据库大写约束；UUID v4 导致成员接口 422；未发布目标 404 清空整页；暂停打卡配置导致发布 422。三个错误 UUID 的空白合成课程按精确 ID 关闭，并检查不存在成员和规则；原记录保留，见 browser-course-failed-fixture-retirement-20260908.txt。这是测试数据处理，不是业务关闭接口验收。

静态协议检查 238 operations / 238 handlers / query 47 / body 116，生成工件已刷新；Portal tsc 退出 0。发布意图两项测试通过，命令须使用 node --import tsx --test tests/course-publication-intent.test.mjs；直接 node --test 因无扩展名 TS 导入无法解析失败，属于测试启动参数错误。

下一步：课程开放及邀请入班；发布两步非原子事务与刷新时故障恢复；原界面仅有模板选择，业务文档的门槛、周频次可选参数尚需在保持布局下接线；学生相机运动提交、教师审核写操作仍需浏览器验收。本记录不代表三端全量完成。

本地 Portal http://localhost:3300/ 使用专用合成教师账号，通过登录表单进入真实教师空间。课程列表显示一门当前课程、一名在班学生；打开原有课程设置弹窗成功。

browser-teacher-navigation-20260908.txt：教师登录以及学生管理、打卡审核、内部成绩册、免测与认证、课程管理导航通过。本轮捕获的真实 API 包括 class-sections、courses、enrollments、students、exercise-records、student-scores、exemption-application-details、physical-results、progress-target，均返回 200。部分页面复用既有数据，没有新增请求；不能把无请求等同于业务操作验收。未观察到 alert 区域或失败请求。

发现尚未接线的业务：teacher-workspace.tsx 的 course-manage 弹窗仍显示旧 TOTAL_ONLY/v8.0 规则说明，course-published-template 永久 disabled、固定占位 option，未读取 rule-templates。当前课程设置不能证明使用现行 V8.1 模板发布和不可变规则。需检查 addCourse/saveCourseSettings 与现行协议，接入模板、规则读取/发布和版本约束，保持既有页面布局。

下一步验证真实创建课程、设置规则、发布后的锁定，以及学生、教师使用同一课程规则。名单与审核的浏览器写操作还需实测。此记录只证明导航和读取范围，不代表教师全部功能或三端全量完成。

## 课程模板接线进度

现有模板下拉框读取分页 rule-templates 和教学班 v81-rules，真实显示选中模板、门槛及周频次，已发布课程禁止修改模板。旧 TOTAL_ONLY/v8.0 说明已改为当前规则说明；页面结构和 CSS 保留。browser-teacher-rule-settings-20260908.txt 通过，真实模板非空且已锁定，导航请求未失败；tsc 退出 0。

未发布课程保存已改为调用 V8.1 规则发布：选择模板，采用模板默认门槛/周频次，现有两类目标换算为分钟；日期按学校 UTC+8 日末，补练截止为常规截止后 7 天，结算安排暂取补练截止。发布前仍先调用原时间窗更新，两步流程尚未完成真实浏览器写入验收，不能认定课程发布成功。时间窗版本已在第一步成功后回写本地状态；发布响应丢失、幂等重试和原子性仍需完善。下一步应先解决两步保存的失败恢复，再测试新建和发布课程。

## 两步发布重试

新增内存发布意图，时间窗和规则发布分别保留固定幂等键；确认时间窗成功后不再重复修改；并发点击共享同一 Promise。未确认结果时拒绝换成不同表单内容，提示先按原内容重试。时间窗提交日期也固定按 +08:00，消除浏览器系统时区差异。此方式不是数据库原子事务，刷新页面后的恢复、确定性校验失败后的编辑恢复仍待验证。

course-publication-intent.test.mjs 两项通过，模拟时间窗及发布响应依次丢失，验证固定键、确认后跳过第一步、并发只写一次；tsc 退出 0。不能用模拟故障测试代替新课程真实发布验收，下一步继续实际创建课程并提交表单。
