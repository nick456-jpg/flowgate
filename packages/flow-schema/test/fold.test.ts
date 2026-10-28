import { describe, expect, it } from "vitest";
import { createEvent, foldRun, type JournalEvent } from "../src";

const at = (second: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString();

const runId = "run_1";

const journal: JournalEvent[] = [
  createEvent(runId, 1, "run.queued", { revisionId: "rev_1", trigger: "manual" }, at(0)),
  createEvent(runId, 2, "run.started", { workerId: "w1" }, at(1)),
  createEvent(runId, 3, "step.entered", { nodeKey: "start", attempt: 1 }, at(2)),
  createEvent(
    runId,
    4,
    "step.succeeded",
    { nodeKey: "start", attempt: 1, output: { query: "hello" }, durationMs: 10 },
    at(3),
  ),
  createEvent(runId, 5, "branch.selected", { nodeKey: "branch_1", branch: "true" }, at(4)),
  createEvent(runId, 6, "step.skipped", { nodeKey: "fetch_1", reason: "branch not selected" }, at(5)),
  createEvent(runId, 7, "run.succeeded", { output: { ok: true } }, at(6)),
];

describe("foldRun", () => {
  it("reconstructs a run at an arbitrary sequence", () => {
    const partial = foldRun(journal, 3);
    expect(partial.status).toBe("running");
    expect(partial.steps.start.status).toBe("running");
    expect(partial.steps.start.attempt).toBe(1);
    expect(partial.terminal).toBe(false);
    expect(partial.lastSeq).toBe(3);
  });

  it("reconstructs the terminal state and outputs", () => {
    const folded = foldRun(journal);
    expect(folded.status).toBe("succeeded");
    expect(folded.output).toEqual({ ok: true });
    expect(folded.steps.start.status).toBe("succeeded");
    expect(folded.steps.start.output).toEqual({ query: "hello" });
    expect(folded.steps.fetch_1.status).toBe("skipped");
    expect(folded.branches.branch_1).toBe("true");
    expect(folded.terminal).toBe(true);
    expect(folded.lastSeq).toBe(7);
  });

  it("tracks retries without losing the final result", () => {
    const retryJournal: JournalEvent[] = [
      createEvent(runId, 1, "run.queued", {}, at(0)),
      createEvent(runId, 2, "run.started", {}, at(1)),
      createEvent(runId, 3, "step.entered", { nodeKey: "fetch_1", attempt: 1 }, at(2)),
      createEvent(runId, 4, "step.failed", { nodeKey: "fetch_1", attempt: 1, error: { message: "boom" }, durationMs: 5 }, at(3)),
      createEvent(runId, 5, "step.retry_scheduled", { nodeKey: "fetch_1", attempt: 1, delayMs: 1000, error: { message: "boom" } }, at(4)),
      createEvent(runId, 6, "step.entered", { nodeKey: "fetch_1", attempt: 2 }, at(5)),
      createEvent(runId, 7, "step.succeeded", { nodeKey: "fetch_1", attempt: 2, output: { status: 200 }, durationMs: 8 }, at(6)),
    ];
    const mid = foldRun(retryJournal, 5);
    expect(mid.steps.fetch_1.retrying).toBe(true);
    const done = foldRun(retryJournal);
    expect(done.steps.fetch_1.status).toBe("succeeded");
    expect(done.steps.fetch_1.attempt).toBe(2);
    expect(done.steps.fetch_1.output).toEqual({ status: 200 });
  });

  it("exposes failures", () => {
    const failed = foldRun([
      createEvent(runId, 1, "run.queued", {}, at(0)),
      createEvent(runId, 2, "run.started", {}, at(1)),
      createEvent(runId, 3, "step.failed", { nodeKey: "prompt_1", attempt: 1, error: { message: "no key" }, durationMs: 1 }, at(2)),
      createEvent(runId, 4, "run.failed", { error: { message: "no key" } }, at(3)),
    ]);
    expect(failed.status).toBe("failed");
    expect(failed.error).toEqual({ message: "no key" });
    expect(failed.steps.prompt_1.status).toBe("failed");
  });
});
