# BNBU-SPORTS-ONLINE-VERSION

BNBU Sports 体育课程与运动记录管理系统，包含学生 Web、教师与管理员门户、后端服务，以及业务规则、API 合同和部署资料。

## 版本说明

本次完整快照保存 2026-09-15 的本地仓库，来源 HEAD 为 `aebb74d73ffb4f1f85b1e9c5354287e77c1b6c61`，同时包含发布时尚未提交的修改和新增文件，共同步 4,875 个源文件，并保留此仓库的根 README 作为入口。源码、业务规则、接口定义、测试、工具及已跟踪证据随快照更新；运行凭证、依赖安装目录、本地临时文件和 Python 缓存不属于发布内容。仓库快照不等于本次重新部署或全平台验收。

## 项目结构

| 目录 | 内容 |
| --- | --- |
| `backend/` | NestJS、TypeScript、Prisma 和 PostgreSQL 后端 |
| `BNBU-Sports-Web-new/frontend/student/` | 学生 Web 应用 |
| `BNBU-Sports-Web-new/portal-teacher-admin/` | React 教师与管理员门户 |
| `docs/business/` | V8.1 业务规则 |
| `docs/backend-contracts/` | API 合同及对应交接资料 |
| `contracts/` | 历史 `1.2.0-contract` RC 快照；当前实现接口见 `docs/backend-contracts/openapi.yaml` |
| `docs/infrastructure/` | 基础设施与部署交接 |
| `tools/` | 本地联调、验证及运维脚本 |

## 接口与安卓交接

当前实现接口为 `docs/backend-contracts/openapi.yaml` 中的 `3.0.0-v81-local-draft`，正式发布登记仍是 `2.0.12-contract`，两者需区分。安卓精选接入资料见独立的 [PR #2](https://github.com/chchaiai/BNBU-SPORTS-ONLINE-VERSION/pull/2)。本完整快照不包含已从本地移除的原生安卓/iOS工程。业务规则顶部的最新确认优先于旧正文说明。

## 本地开发

建议使用 Node.js 24、npm 11 和 Docker Desktop。各模块独立安装依赖，具体配置见 [后端运行手册](backend/docs/local-runbook.md) 与 [本地联调说明](tools/local-integration/README.md)。

### 后端

在仓库根目录执行：

```powershell
npm --prefix backend ci
npm --prefix backend run local:env:init
npm --prefix backend run local:env:check
docker compose --env-file backend/.env -f backend/docker-compose.yml up -d
npm --prefix backend run db:generate
npm --prefix backend run db:migrate:deploy
npm --prefix backend run db:seed:local
npm --prefix backend run start:dev
```

默认 API 地址为 `http://127.0.0.1:3000/api/v1`。初始化与 seed 命令用于本地开发环境。

### 学生 Web

新开 PowerShell 窗口，在仓库根目录执行：

```powershell
$env:APP_ENV = 'local'
node BNBU-Sports-Web-new/frontend/preview-server.cjs
```

打开 `http://127.0.0.1:4174/student/`。详细说明见 [学生端文档](BNBU-Sports-Web-new/frontend/student/README.md)。

### 教师与管理员门户

```powershell
npm --prefix BNBU-Sports-Web-new/portal-teacher-admin ci
npm --prefix BNBU-Sports-Web-new/portal-teacher-admin run dev -- --hostname 127.0.0.1 --port 3001
```

打开 `http://127.0.0.1:3001`。更多说明见 [门户文档](BNBU-Sports-Web-new/portal-teacher-admin/README.md)。

## 规则与验证

- [业务规则入口](docs/business/README.md)：总流程、学生端、教师端和管理员端四份权威文档。
- [实现与验收记录](docs/implementation/)：实现状态及验证范围。
- [基础设施资料](docs/infrastructure/)：部署依赖与交接记录。

代码归档、测试通过和线上验收是不同状态，应以相应环境的实际记录为准。此次仓库更新未重新执行完整业务回归。

## 配置与使用范围

本地 `.env`、依赖目录、构建产物及 `.local/` 不纳入快照。生产密钥由运行环境的私有配置提供。新仓库的 GitHub Actions 保持关闭，部署需按项目交接流程执行。

仓库公开用于代码查阅与项目交流；未额外授予开源许可证。第三方组件的使用须遵循其各自许可证，随附组件保留原许可证文件。
