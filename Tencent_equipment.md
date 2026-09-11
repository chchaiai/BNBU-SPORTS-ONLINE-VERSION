【CVM】
名称：BNBU_SPORTS_HK
地域：中国香港 / 香港二区
内网 IP：172.19.0.13
公网 IP：43.129.193.7
系统：Ubuntu 22.04
VPC：BNBUSPORTS
子网：Default-Subnet

【PostgreSQL】
实例：BNBUSPORTSSQLHK
版本：PostgreSQL 18.6
内网：172.19.0.16:5432
数据库：bnbusports
管理账号：bnbusports_sqladmin
Backend 账号：bnbusports_app
安全组：仅允许 172.19.0.13/32 → TCP 5432

【COS】
Bucket：bnbu-sports-prod-hk-1443273655
Region：ap-hongkong
权限：私有读写
域名：bnbu-sports-prod-hk-1443273655.cos.ap-hongkong.myqcloud.com
CAM：bnbusports-cos-backend（配置中）

【架构】
用户 → CVM Backend
          ├→ PostgreSQL（业务数据）
          └→ 生成 Pre-signed URL
                    ↓
              用户直传 COS（图片/视频）

【2026-09-09 Staging 基础设施实测更新】
用途：本文件列出的香港设备用于当前 Staging；桶名中的 prod 不代表生产验收完成。
CVM 实例：ins-kfitq8i6；VPC：vpc-683l8xss；子网：subnet-ej6xg6gf。
PostgreSQL 实例 ID：postgres-entm7byh；安全组：sg-bo8xycnp。
PostgreSQL SSL：已开启，保护地址 172.19.0.16；两个现有账号均完成实际 TLS 登录。
严格校验：verify-full 与 CA 链校验通过；应用账号禁止建库、建角色、public 建表。
数据库状态：业务表 0；本次基础设施测试事务已回滚，未执行 Backend 业务迁移。
备份：每日 01:01–05:01，数据与日志均保留 7 天，已有成功自动物理备份。

COS Backend 实际采用实例角色 BNBUSportsHKCVMRole（已绑定上述 CVM），
策略 BNBUSportsHKCOSLeastPrivilege（285832458），通过临时凭据访问。
原“bnbusports-cos-backend（配置中）”是最初计划记录；本次实际验证使用上述角色。
策略范围：香港桶 media/* 与 roster-sources/*；分片与删除仅限 roster-sources/*。
COS：私有读写；多 AZ；默认 SSE-COS / AES256 加密已开启。
CORS：仅 https://www.student.bnbusports.cn、https://www.teacher.bnbusports.cn，
PUT/GET/HEAD，Content-Type/Content-Length，Expose ETag/Content-Length，600 秒，Vary 已开启。

学生端：https://www.student.bnbusports.cn
教师/管理端：https://www.teacher.bnbusports.cn
两条 A 记录已指向 43.129.193.7；HTTPS 证书已签发，有效期至 2026-12-08。
基础设施入口 /__infra/health 返回 200；根路径返回 503 BACKEND_DEPLOYMENT_PENDING。
CVM 已安装 Docker 29.8.0、Compose 5.5.1、Buildx 0.37.0，Nginx 在运行。
原 bnbusports.cn 分发站仍在同机运行，后续 Backend 使用独立目录及 127.0.0.1:3000。

完整验证、剩余依赖及交接：docs/infrastructure/tencent-hk-staging-handoff-20260909.md。
