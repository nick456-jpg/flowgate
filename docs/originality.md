# 原创性与改造说明

## 1. 背景

本项目（FlowGate）与参考项目（FlowAI Studio）属于同一产品方向：可视化 DAG 编排 + 运行 + 查看结果。参考仓库在原作者授权下用于理解功能需求；FlowGate 的代码在独立的领域模型、运行引擎与界面表达上从零实现。

需要区分两件事：

- **功能、想法、产品流程**通常不受版权保护，可以做同类产品。
- **代码、数据库结构、UI 文案/视觉、文档、素材**是具体表达，不能复制。

因此，「改几个文件躲查重」不是可靠方案；可靠方案是**按功能规格重新实现，并留下可验证的独立设计**。

## 2. 可保留 / 必须重写 / 必须重新设计

| 层次 | 可以相同 | 必须重写 | 必须重新设计 |
|---|---|---|---|
| 产品 | 编排 → 运行 → 查看结果；DAG；版本 | 所有界面文案、空状态、演示数据 | 运行 = 事件流；底部运行带；回放/分叉 |
| 领域词 | pipeline / revision / run 等行业通用词 | Application、Workflow、WorkflowVersion、Execution、Trace、Span、Skill、McpServer | Workspace → Project → Pipeline → Revision；Run → Step + JournalEvent |
| 技术 | React、NestJS、Postgres、Redis、SSE、JWT 等公开技术 | 文件名、模块名、DTO、store 形状、主题、CSS | BullMQ worker + Postgres journal 为真相；JSONB 图 + 共享 Zod；租约/心跳/恢复 |
| 接口 | REST、RFC 7807、OpenAPI 思路、SSE 协议 | `/api` 前缀、统一 `{success,data}` 信封 | `/v1` 资源化、problem+json、游标、If-Match、Idempotency-Key、带 seq 的 SSE |
| 数据 | 关系建模、UUID、外键 | 表名、列语义、字符串存 JSON | 草稿/修订分离、`graph JSONB + hash`、append-only `run_events`、`run_steps` 投影 |
| 界面 | AntD / React Flow 等库 | 原项目的布局、配色、文案、节点样式 | 深石墨 + 琥珀/青绿、左侧步骤库、右侧单步检查器、底部运行带、回放滑杆 |

## 3. 本项目的独立设计

1. **领域模型**：`Workspace → Project → Pipeline → Revision → Run → RunStep + RunEvent`，没有 Application / Workflow / Execution / Trace / Span 的对应关系。
2. **事件溯源运行**：Postgres journal 是真相，`run_steps` 是可重建投影；`seq` 在事务内分配，SSE 从 journal 读，不依赖内存 Subject。
3. **恢复与分叉**：Redis 租约 + 心跳 + sweeper；fork 用 `parentRunId/parentSeq` 做 lineage，子事件 seq 从父 fork 点继续，不复制历史。
4. **共享契约**：`packages/flow-schema` 同时提供 CJS/ESM，前端/后端/测试共用图校验、事件信封、`foldRun()` 和 DTO。
5. **API**：`/v1` + RFC 7807 + 游标分页 + `If-Match` + `Idempotency-Key` + cursor SSE；没有统一响应信封。
6. **界面**：深石墨/琥珀/青绿视觉、单 `StepNode`、descriptor 驱动表单、底部运行带与事件流，均为独立实现。
7. **安全**：Argon2id、refresh cookie 轮换、AES-GCM、SSRF 防护、全局限流、Prisma 参数化。

## 4. 相似度自检

使用 [scripts/similarity-check.mjs](../scripts/similarity-check.mjs) 对参考仓库与本项目做 8-gram token 重合度检查（仅比较 `.ts/.tsx` 源码，排除 node_modules/dist）：

```text
reference source files: 197
target source files:    82
identical files:        0
mean 8-gram overlap:    0.85%
top overlaps:
  38.1%  apps/web/vite.config.ts
   4.2%  apps/api/src/app.module.ts
   3.0%  apps/api/src/identity/identity.module.ts
   3.0%  apps/api/src/platform/rate-limit.guard.ts
   ...
```

- **0 个完全相同的源码文件**。
- 平均重合度 **0.85%**。
- 最高项是标准的 Vite 配置样板（插件、代理、端口），不包含业务逻辑；所有业务源文件低于 5%。
- 标准配置文件名（`package.json`、`tsconfig.json`、`main.ts` 等）与框架样板不可避免会重合，这不构成业务代码复制。

可复现：

```bash
pnpm originality:check -- --reference <参考仓库路径> --target .
```

## 5. 与参考项目的边界

- 未复制参考项目的任何源码、Prisma schema、迁移、seed、README/文档、截图或 UI 素材；也未复制其 showcase 的 HTML/CSS/JS、视频、海报、架构图或截图。
- 未沿用参考项目的品牌名、主题色、页面结构或文案。
- 参考项目 `flowai-studio-backend/package.json` 标注 MIT，但仓库根目录未见 LICENSE；本项目未复用其代码，因此不继承其许可。若未来需要引用任何片段，必须保留 MIT 版权与许可声明。
- 本项目当前未附 LICENSE；公开发布前请选择合适许可证。

## 6. 展示页、架构图与录屏

- 展示页 `showcase/index.html` 是独立的原生 HTML/CSS/JS 页面，包含中英切换、章节、灯箱与响应式布局；导航、英雄区、能力卡、架构、视频、截图廊和页脚的视觉与实现均为独立设计。
- 架构图 `showcase/assets/architecture.svg` 由 `showcase/scripts/build-architecture.mjs` 根据本项目的真实模块、数据表与运行链路生成，不是参考项目的架构图。
- 六张截图来自本地运行的 FlowGate（2508×1451 / 2512×1551 高 DPI），不是参考项目的截图。
- 1:55 录屏 `showcase/assets/demo.mp4` 在本地无头 Chrome 中录制，只捕获页面内容；使用演示数据与 `LLM_MOCK`，未调用真实模型 API；配 11 条中文字幕和 8 个章节。
- 参考 showcase 仅用于「作品集页面应包含哪些区块」的结构参考，未复制其 HTML、CSS、文案、主题、图片或视频素材。

## 7. 如果用途变化

如果这个项目将来用于课程、毕业设计或学术评审，仅靠「改代码避免查重」不等于原创，需按学校规范披露参考关系与个人贡献。当前定位是个人作品集 / 工程练手，建议保留本文档作为设计来源与差异化的证据。
