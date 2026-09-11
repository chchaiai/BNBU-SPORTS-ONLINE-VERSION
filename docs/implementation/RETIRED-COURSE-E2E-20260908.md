# 旧管理员课程写入停用 E2E（2026-09-08）

依据docs/business/30-admin-flow.md关于管理员不能创建或管理课程的现行规则；教师经/teacher/courses创建并修改本人教学班。旧/courses POST与/courses/{id} PATCH由角色策略及管理员权限守卫拒绝。

教学结构套件补充旧课程修改：有效课程ID及当前version下，教师和管理员都403，课程整行保持原值。原有旧课程创建拒绝、当前教师建课幂等/课程读取/教学班修改/维护及组织隔离一起首轮8/8通过。

两个旧操作协议标deprecated及停用原因，移除2xx响应声明；运行清单转为停用，expectedDisabledOperationCount=33，静态登记为93普通+33停用，123仍未登记。生成协议和路线图，parity249通过。协议同步后复测8/8通过，结果见docker-retired-course-e2e-retest-20260908.txt，首轮docker-retired-course-e2e-first-20260908.txt保留。

未修改产品业务代码或UI，未关闭现行教师课程流程。学生注销分类、123项登记、三端浏览器及最终验收仍待继续。此项属于明确现行业务停用，不能以创建旧课程成功作为验收目标。
