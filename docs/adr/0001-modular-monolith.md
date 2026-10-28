# ADR 0001：模块化单体 + 独立 worker

## 背景

FlowGate 需要 HTTP API、画布编辑、后台运行与崩溃恢复。单开发者、单仓库、首版以演示与可维护性为先。微服务会引入额外的部署、契约与调试成本；纯单进程又会把长任务和 HTTP 生命周期绑在一起。

## 决策

采用 **NestJS 模块化单体**，以 `platform → identity → workspace → catalog → runtime → integrations` 的依赖方向组织；HTTP 与 worker 共用同一套业务模块，通过 `RUNTIME_ROLE=http|worker` 启动不同入口：

- `apps/api/src/main.ts` 启动 HTTP，挂全局鉴权/限流守卫与 problem+json 过滤器。
- `apps/api/src/worker.ts` 启动 application context，创建 BullMQ Worker 与 sweeper。
- 两个入口共享 Prisma、Redis、Catalog 读接口与 Runtime 服务；没有 `forwardRef`。

## 取舍

- 运行逻辑只有一份，测试与本地调试成本低。
- 水平扩展需要把 L1 缓存、取消 watcher 等进程内状态外置；首版明确接受单实例假设。
- worker 与 HTTP 的发布版本必须一致，因此共用同一镜像/构建产物。

## 结果

- 本地一条 `pnpm dev` 即可同时起 API、worker、Web。
- Docker Compose 里 `api` 与 `worker` 使用同一个镜像、不同 command，环境变量区分角色。
- 业务模块无循环依赖，后续可把 `runtime` 或 `integrations` 拆成独立服务而不改变领域边界。
