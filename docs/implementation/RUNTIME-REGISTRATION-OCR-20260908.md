# OCR及导入接口证据登记（2026-09-08）

接续c2aed46a，补29项：OCR受理2、读取4、任务2、草稿3、名单确认2、体测确认2、治理3、CSV/XLSX体测导入8、名单基准3。控制器和方法通过TypeScript AST的OperationPolicy绑定提取，附实际this.service调用；源码中出现的v81表/视图标识与迁移SQL引用交叉定位。migration字段是相关迁移引用集合，不宣称每个迁移都被每个请求执行。

OCR业务指向v81-ocr-intake.e2e.test.ts及受理/草稿/名单/体测/来源专项证据；治理指向v81-ocr-governance；电子体测导入指向v81-physical-imports。contractTest为真实执行严格HTTP hook的同一文件，contractValidation显式说明校验来源。全部文件和唯一绑定已检查，未使用通用静态测试冒充新接口验证。

当前168/249登记：134普通、34停用、81未登记。Docker静态登记一致性和报告准确性单元5/5通过，日志docker-runtime-registration-ocr-20260908.txt。此轮未重跑业务全量；最新全量仍第十轮92/92，登记不等于新增业务验收。合成OCR、内存存储、测试身份等边界继续见专项证据。

未修改产品代码或UI。其余登记及三端整体验收继续。
