import type { RunStatus, StepStatus } from "../lib/types";

const LABELS: Record<string, string> = {
  queued: "排队中",
  running: "运行中",
  succeeded: "成功",
  failed: "失败",
  cancelled: "已取消",
  skipped: "跳过",
  pending: "待运行",
};

export function StatusTag({ status }: { status: RunStatus | StepStatus | string }) {
  return <span className={`status-tag status-tag--${status}`}>{LABELS[status] ?? status}</span>;
}
