import { z } from "zod";

export const RUN_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
export const runStatusSchema = z.enum(RUN_STATUSES);
export type RunStatus = (typeof RUN_STATUSES)[number];

export const STEP_STATUSES = ["pending", "running", "succeeded", "failed", "skipped"] as const;
export const stepStatusSchema = z.enum(STEP_STATUSES);
export type StepStatus = (typeof STEP_STATUSES)[number];

export const EVENT_TYPES = [
  "run.queued",
  "run.started",
  "run.recovered",
  "run.resumed",
  "run.cancel_requested",
  "run.succeeded",
  "run.failed",
  "run.cancelled",
  "step.entered",
  "step.succeeded",
  "step.failed",
  "step.skipped",
  "step.retry_scheduled",
  "branch.selected",
  "llm.usage",
] as const;

export const eventTypeSchema = z.enum(EVENT_TYPES);
export type JournalEventType = (typeof EVENT_TYPES)[number];

export const journalEventSchema = z.object({
  v: z.literal(1),
  runId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  type: eventTypeSchema,
  at: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
});

export type JournalEvent = z.infer<typeof journalEventSchema>;

export const TERMINAL_RUN_EVENTS = ["run.succeeded", "run.failed", "run.cancelled"] as const;

export function isTerminalRunEvent(type: JournalEventType): boolean {
  return (TERMINAL_RUN_EVENTS as readonly string[]).includes(type);
}

const TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  queued: ["running", "cancelled"],
  running: ["succeeded", "failed", "cancelled", "queued"],
  succeeded: [],
  failed: ["queued"],
  cancelled: ["queued"],
};

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertRunTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`illegal run transition: ${from} -> ${to}`);
  }
}

export type SerializedError = {
  name?: string;
  message: string;
  code?: string;
  status?: number;
};

export type RunQueuedPayload = { revisionId: string; trigger: string };
export type RunStartedPayload = { workerId: string };
export type RunRecoveredPayload = { previousLease: string | null };
export type RunResumedPayload = { fromSeq: number };
export type RunSucceededPayload = { output: unknown };
export type RunFailedPayload = { error: SerializedError };
export type StepEnteredPayload = { nodeKey: string; attempt: number };
export type StepSucceededPayload = {
  nodeKey: string;
  attempt: number;
  output: unknown;
  durationMs: number;
};
export type StepFailedPayload = {
  nodeKey: string;
  attempt: number;
  error: SerializedError;
  durationMs: number;
};
export type StepSkippedPayload = { nodeKey: string; reason: string };
export type StepRetryScheduledPayload = {
  nodeKey: string;
  attempt: number;
  delayMs: number;
  error: SerializedError;
};
export type BranchSelectedPayload = { nodeKey: string; branch: "true" | "false" };
export type LlmUsagePayload = {
  nodeKey: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
};

export function createEvent(
  runId: string,
  seq: number,
  type: JournalEventType,
  payload: Record<string, unknown>,
  at = new Date().toISOString(),
): JournalEvent {
  return { v: 1, runId, seq, type, at, payload };
}
