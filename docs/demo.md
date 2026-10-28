# 2 分钟演示脚本

前置：`pnpm infra:up && pnpm db:migrate && pnpm db:seed && pnpm dev`，浏览器打开 <http://localhost:5173>。`LLM_MOCK=true`，无需真实模型 Key。

演示账号：`demo@flowgate.dev` / `flowgate-demo`。

录屏版本：1:55，1920×1080，静音，中文字幕（11 条），8 个章节。使用本地演示数据与 `LLM_MOCK`，提示词延迟 2.5s、HTTP 延迟 0.8s，未调用真实模型 API。

## 0:00–0:13 登录

- 点击「填入」使用演示账号，登录。
- access token 只在内存，refresh 走 HttpOnly cookie；刷新页面仍保持登录。

## 0:13–0:22 工作区

- 展示项目数、管道数与 Event-sourced 运行模型。
- 打开「示例项目」。

## 0:22–0:34 项目与运行历史

- 管道卡显示修订数与运行次数；最近运行表显示状态、开始时间与耗时。
- 打开「线索分级管道」。

## 0:34–0:44 编排画布

- 左侧步骤库：起点、提示词、变换、分支、请求、响应。
- 6 节点 DAG：起点 → 线索评估 → 预算判断 →（真）同步 CRM → 高价值响应；假分支通向普通线索。
- 顶部显示「已发布 v2」；底部提示运行后会在这里显示步骤状态与事件流。

## 0:44–0:54 节点配置

- 点击「线索评估」节点：右侧展示 descriptor 驱动的配置。
- 指出系统提示、用户模板（`{{inputs.company}}` / `{{inputs.budget}}`）、温度、最大 Token 与失败重试次数。
- 可用上游变量由节点 Key 自动推导。

## 0:54–1:02 发起运行

- 点击「运行」，选择已发布修订 v2，保留默认 JSON 输入（`company=星海制造`、`budget=50000`）。
- 开始运行；运行带出现，SSE 从 Postgres journal 推送事件。

## 1:02–1:13 取消：保留已完成步骤

- 在提示词执行期间点「取消」。
- 事件流出现 `run.cancel_requested`；正在执行的提示词仍正常完成（2.5s），随后 `run.cancelled`。
- 此时共 9 个事件：起点、提示词成功；分支/请求/响应尚未执行。
- 这说明取消不是粗暴中断，而是把已发生的副作用记录下来，便于恢复。

## 1:13–1:26 恢复

- 点「恢复」：同一 run 重新入队，事件流出现 `run.queued` → `run.resumed`。
- 已成功的起点与提示词不重复调用模型；从 branch 继续。
- 运行完成，共 20 个事件，最终输出 `route=sales`、CRM echo 与 summary。
- 选中「同步 CRM」步骤可查看 HTTP 输出；20 个事件与 9 个事件的对比说明断点恢复的语义。

## 1:26–1:40 回放

- 拖动回放滑杆到 seq 11；画布节点、运行带、事件流与输出同步回退，顶部显示「回放 #11」。
- 此时运行状态显示为「运行中」，fetch 仍是 pending，事件流只显示到 #11。
- 点「回到实时」回到 20 个事件的最新状态。
- 回放使用同一个 `foldRun()` 纯函数，不依赖录制视频或快照。

## 1:40–1:48 从步骤分叉

- 在运行带选择已成功的「线索评估」步骤。
- 点「从此分叉」；子运行创建，标题出现「分叉自 #...」。
- 从 prompt 分叉会重跑 prompt 及其下游，同时保留 `parentRunId + parentSeq` 谱系；若从更下游的成功步骤分叉，则复用上游输出。
- 子运行完成，共 18 个事件，耗时约 3.5s。

## 1:48–1:55 收尾

- 展示分叉运行的完整事件日志与最终输出。
- 一句话：每次运行都是一条可回放、可恢复、可分叉的事件流。

## 录屏参数

- 1920×1080，H.264，静音；页面级 CDP screencast，只捕获应用内容，不包含浏览器 UI 或桌面。
- 11 条中文字幕，8 个章节；视频文件 `showcase/assets/demo.mp4`，字幕 `showcase/assets/demo.vtt`，封面 `showcase/assets/poster.png`。

## 可选：崩溃恢复

1. 运行期间 `docker kill flowgate-worker-1`（或停止 `pnpm dev` 的 worker）。
2. 15 秒内重新启动 worker。
3. sweeper 发现过期租约，写 `run.recovered` 并把运行重新入队；运行从断点继续。
4. 在事件流中展示 `run.recovered` → `run.resumed`。

## 真实模型

- 环境变量：`LLM_MOCK=false` + `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`。
- 或在「设置 → 模型连接」保存 OpenAI 兼容的 Base URL / 模型 / Key；密钥 AES-256-GCM 加密，接口不回显。
