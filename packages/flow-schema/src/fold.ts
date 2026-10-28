import type { JournalEvent } from "./events";
import type { RunStatus, StepStatus } from "./events";

export type FoldedStep = {
  key: string;
  status: StepStatus;
  attempt: number;
  retrying: boolean;
  output?: unknown;
  error?: unknown;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
};

export type FoldedRun = {
  status?: RunStatus;
  output?: unknown;
  error?: unknown;
  startedAt?: string;
  finishedAt?: string;
  cancelling: boolean;
  steps: Record<string, FoldedStep>;
  branches: Record<string, "true" | "false">;
  lastSeq: number;
  terminal: boolean;
};

const TERMINAL: ReadonlySet<string> = new Set(["succeeded", "failed", "cancelled"]);

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function ensureStep(steps: Record<string, FoldedStep>, key: string): FoldedStep {
  const existing = steps[key];
  if (existing) return existing;
  const created: FoldedStep = { key, status: "pending", attempt: 0, retrying: false };
  steps[key] = created;
  return created;
}

export function foldRun(events: JournalEvent[], uptoSeq = Number.POSITIVE_INFINITY): FoldedRun {
  const fold: FoldedRun = {
    cancelling: false,
    steps: {},
    branches: {},
    lastSeq: 0,
    terminal: false,
  };

  const ordered = events
    .filter((event) => event.seq <= uptoSeq)
    .slice()
    .sort((a, b) => a.seq - b.seq);

  for (const event of ordered) {
    fold.lastSeq = Math.max(fold.lastSeq, event.seq);
    const payload = event.payload ?? {};

    switch (event.type) {
      case "run.queued":
        fold.status = "queued";
        fold.cancelling = false;
        break;
      case "run.started":
      case "run.resumed":
        fold.status = "running";
        fold.cancelling = false;
        fold.startedAt = fold.startedAt ?? event.at;
        fold.finishedAt = undefined;
        break;
      case "run.recovered":
        fold.status = "queued";
        break;
      case "run.cancel_requested":
        fold.cancelling = true;
        break;
      case "run.succeeded":
        fold.status = "succeeded";
        fold.cancelling = false;
        fold.output = payload.output;
        fold.finishedAt = event.at;
        break;
      case "run.failed":
        fold.status = "failed";
        fold.cancelling = false;
        fold.error = payload.error;
        fold.finishedAt = event.at;
        break;
      case "run.cancelled":
        fold.status = "cancelled";
        fold.cancelling = false;
        fold.finishedAt = event.at;
        break;
      case "step.entered": {
        const key = asString(payload.nodeKey);
        if (!key) break;
        const step = ensureStep(fold.steps, key);
        step.status = "running";
        step.attempt = typeof payload.attempt === "number" ? payload.attempt : step.attempt + 1;
        step.retrying = false;
        step.startedAt = step.startedAt ?? event.at;
        step.endedAt = undefined;
        step.output = undefined;
        step.error = undefined;
        break;
      }
      case "step.succeeded": {
        const key = asString(payload.nodeKey);
        if (!key) break;
        const step = ensureStep(fold.steps, key);
        step.status = "succeeded";
        step.retrying = false;
        step.output = payload.output;
        step.error = undefined;
        step.attempt = typeof payload.attempt === "number" ? payload.attempt : step.attempt;
        step.endedAt = event.at;
        step.durationMs = typeof payload.durationMs === "number" ? payload.durationMs : undefined;
        break;
      }
      case "step.failed": {
        const key = asString(payload.nodeKey);
        if (!key) break;
        const step = ensureStep(fold.steps, key);
        step.status = "failed";
        step.retrying = false;
        step.error = payload.error;
        step.attempt = typeof payload.attempt === "number" ? payload.attempt : step.attempt;
        step.endedAt = event.at;
        step.durationMs = typeof payload.durationMs === "number" ? payload.durationMs : undefined;
        break;
      }
      case "step.retry_scheduled": {
        const key = asString(payload.nodeKey);
        if (!key) break;
        const step = ensureStep(fold.steps, key);
        step.status = "running";
        step.retrying = true;
        step.attempt = typeof payload.attempt === "number" ? payload.attempt : step.attempt;
        step.error = payload.error;
        break;
      }
      case "step.skipped": {
        const key = asString(payload.nodeKey);
        if (!key) break;
        const step = ensureStep(fold.steps, key);
        step.status = "skipped";
        step.retrying = false;
        step.endedAt = event.at;
        break;
      }
      case "branch.selected": {
        const key = asString(payload.nodeKey);
        if (!key) break;
        fold.branches[key] = payload.branch === "false" ? "false" : "true";
        break;
      }
      case "llm.usage":
        break;
      default:
        break;
    }
  }

  fold.terminal = fold.status !== undefined && TERMINAL.has(fold.status);
  return fold;
}
