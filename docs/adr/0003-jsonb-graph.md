# ADR 0003：用 JSONB 存图 + 共享 Zod 校验

## 背景

管道是一个小型 DAG（首版 ≤100 节点），需要频繁保存草稿、发布不可变修订、在画布与运行器之间共享结构。把 nodes/edges 规范化成独立表会带来发布快照、边引用、级联更新与迁移复杂度，而首版并不需要服务端图查询。

## 决策

- `pipeline_drafts.graph` / `revisions.graph` 以 JSONB 保存 `{schemaVersion, nodes, edges}`。
- 节点包含 `id/key/kind/title/position/config/maxAttempts`；边用 node id 引用并带 `sourceHandle`。
- `packages/flow-schema` 用 Zod 定义节点配置、图与事件；保存/发布/运行前都校验：唯一 key、exactly one start、至少一个 respond、无环、可达、分支 handle、respond 无出边等。
- canonical JSON 的 SHA-256 作为 `graphHash`，用于修订去重与审计。
- `schemaVersion` + `upcastGraph()` 作为未来 DSL 迁移缝。

## 取舍

- 无法在 SQL 里高效查询「所有引用了 prompt_1 的边」；首版不需要。
- 图在每次保存时整体覆盖，写放大可接受（≤100 节点）。
- 图校验与前端表单共享同一份 Zod schema，减少前后端漂移；Zod 错误路径直接映射 RFC 7807 的 pointer。

## 结果

- 修订是不可变快照，run 绑定 `revisionId`，回放永远能看到当时的图。
- 画布、运行器与测试共用 `topologicalOrder()` / `indexGraph()` / `assertRunTransition()`，没有第二套图模型。
