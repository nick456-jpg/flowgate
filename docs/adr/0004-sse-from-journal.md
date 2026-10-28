# ADR 0004：SSE 从持久化 journal 读取

## 背景

实时运行状态最容易写成「进程内 Subject + 内存事件」：简单，但刷新、断线、切换标签页、worker 重启后就丢失；多实例也无法回放。首版已经把事件写入 Postgres，SSE 应该直接消费这份真相。

## 决策

- 端点：`GET /v1/runs/:id/events?cursor=N`，也接受 `Last-Event-ID`。
- 每条事件写成 SSE 的 `id: <seq>`、`event: <type>`、`data: <journalEvent JSON>`。
- 连接建立时先发送 `seq > cursor` 的历史（包含 fork 继承的父前缀），之后每 600ms 查询本 run 的新事件；终态事件后关闭；每 15 秒写 `: keepalive`。
- 不使用 `@Sse` 的 Observable 或进程内 Subject；不把 Redis 当作事件真相。
- 前端解析 SSE 帧，用共享 `foldRun()` 增量重建画布状态；回放滑杆直接调用同一个 fold。

## 取舍

- 轮询带来周期性 DB 读；首版以简单、可恢复为先。规模上来后可换成 Postgres LISTEN/NOTIFY 或 Redis Pub/Sub 唤醒，但仍以 journal 为真相。
- 历史事件可能较大；按 200 条批量读取并在客户端用 cursor 续传。
- SSE 连接是长连接，Nginx 需要关闭 buffering 并放宽 read timeout（见 `infra/nginx.conf`）。

## 结果

- 刷新/断线后不会漏事件；任何时刻都可以从 cursor 继续。
- 回放、实时、fork 子运行共用同一套事件与折叠逻辑，前端没有第二套状态机。
