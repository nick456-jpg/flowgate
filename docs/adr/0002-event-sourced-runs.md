# ADR 0002：事件溯源的运行模型

## 背景

首版的核心差异点是「运行回放 + 恢复 + 从步骤分叉」。如果把运行存成一行状态字段，回放需要额外快照，恢复需要猜哪些步骤已完成，fork 需要复制上下文。三种需求都指向同一件事：运行过程本身应当是可重放的日志。

## 决策

- `runs` 保存运行头（revision、inputs、status、lease、idempotency、parent lineage）。
- `run_events` 是 append-only 真相：`run.*` / `step.*` / `branch.selected` / `llm.usage`。
- `run_steps` 只是列表与详情用的投影，可在任意时刻由事件重建。
- `seq` 在事务内通过 `UPDATE runs SET event_seq = event_seq + 1 ...` 分配；`(run_id, seq)` 唯一。
- Redis 只负责 BullMQ 调度、租约、限流与唤醒；SSE 永远读 Postgres。
- fork 用 `parentRunId + parentSeq` 表示有效历史前缀，子运行自己的事件从 `parentSeq + 1` 开始，不复制父事件。

## 取舍

- 事件 payload 使用 JSONB，查询/约束能力弱于强类型表；但事件目录由共享 Zod/TS 类型约束。
- 外部副作用是 at-least-once：恢复/重试可能重复调用 `fetch`；通过 attempt 与事件日志暴露，而不是宣称 exactly-once。
- 需要 sweeper 处理租约过期的 run；多实例需要额外的租约与恢复协调，但比复制状态更容易推理。

## 结果

- 回放是 `foldRun(events, uptoSeq)` 的纯函数，前后端共用。
- 恢复复用同一 run id，只重跑未成功步骤。
- fork 只新增一行 run 与自己的事件，父运行保持不可变。
- 运行历史可直接回答「哪个步骤、哪次尝试、为什么跳过、模型用了多少 token」。
