import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import {
  foldRun,
  indexGraph,
  pipelineGraphSchema,
  topologicalOrder,
  type SerializedError,
} from "@flowgate/schema";
import { PrismaService, RedisService } from "../platform/platform.providers";
import { HistoryService } from "./history.service";
import { JournalService } from "./journal.service";
import { markBranchSelected, markNodeSkipped, nodeIsBlocked, seedEdgeStates } from "./planner";
import { StepRunner } from "./step-runner.service";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    const extended = error as Error & { code?: string; status?: number };
    return {
      name: error.name,
      message: error.message,
      code: extended.code,
      status: extended.status,
    };
  }
  return { message: String(error) };
}

function jsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

@Injectable()
export class ExecutorService {
  private readonly logger = new Logger(ExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly journal: JournalService,
    private readonly history: HistoryService,
    private readonly runner: StepRunner,
  ) {}

  async execute(runId: string): Promise<void> {
    const run = await this.prisma.run.findUnique({
      where: { id: runId },
      include: { revision: true, pipeline: { include: { project: true } } },
    });
    if (!run) return;
    if (run.status === "succeeded" || run.status === "failed" || run.status === "cancelled") return;
    if (run.cancelRequestedAt) {
      await this.finishCancelled(runId);
      return;
    }

    const workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
    if (!(await this.acquireLease(runId, workerId))) return;

    const abort = new AbortController();
    const heartbeat = setInterval(() => void this.renewLease(runId, workerId), 5_000);
    const cancelWatch = setInterval(() => void this.checkCancel(runId, abort), 500);
    heartbeat.unref();
    cancelWatch.unref();

    try {
      const graph = pipelineGraphSchema.parse(run.revision.graph);
      const priorEvents = await this.history.history(runId);
      const prior = foldRun(priorEvents);
      if (prior.terminal) return;

      if (prior.status === undefined || prior.status === "queued") {
        const type = run.startedAt ? "run.resumed" : "run.started";
        await this.journal.record(
          runId,
          type,
          { workerId },
          {
            status: "running",
            startedAt: run.startedAt ?? new Date(),
            leaseOwner: workerId,
            leaseExpiresAt: new Date(Date.now() + 20_000),
          },
        );
      } else {
        await this.prisma.run.update({
          where: { id: runId },
          data: { leaseOwner: workerId, leaseExpiresAt: new Date(Date.now() + 20_000) },
        });
      }

      const fresh = await this.prisma.run.findUniqueOrThrow({
        where: { id: runId },
        select: { cancelRequestedAt: true },
      });
      if (fresh.cancelRequestedAt) {
        await this.finishCancelled(runId);
        return;
      }

      const inputs = isRecord(run.inputs) ? run.inputs : {};
      const steps: Record<string, { output: unknown }> = {};
      for (const [key, step] of Object.entries(prior.steps)) {
        if (step.status === "succeeded") steps[key] = { output: step.output };
      }
      const skippedKeys = Object.entries(prior.steps)
        .filter(([, step]) => step.status === "skipped")
        .map(([key]) => key);

      const index = indexGraph(graph);
      const edgeStates = seedEdgeStates(graph, prior.branches, skippedKeys);

      for (const key of topologicalOrder(graph)) {
        const node = index.byKey.get(key);
        if (!node) continue;
        if (prior.steps[key]?.status === "succeeded") continue;

        if (abort.signal.aborted || (await this.isCancelRequested(runId))) {
          await this.finishCancelled(runId);
          return;
        }

        const incoming = index.incoming.get(key) ?? [];
        if (nodeIsBlocked(incoming, edgeStates)) {
          await this.markStepSkipped(runId, key);
          await this.journal.record(runId, "step.skipped", { nodeKey: key, reason: "上游分支未选中" });
          markNodeSkipped(edgeStates, index.outgoing.get(key) ?? []);
          continue;
        }

        const maxAttempts = node.maxAttempts ?? 1;
        let succeeded = false;
        let cancelled = false;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          if (abort.signal.aborted || (await this.isCancelRequested(runId))) {
            cancelled = true;
            break;
          }

          await this.markStepRunning(runId, key, attempt);
          await this.journal.record(runId, "step.entered", { nodeKey: key, attempt });
          const started = Date.now();

          try {
            const result = await this.runner.run(
              node,
              { workspaceId: run.pipeline.project.workspaceId, inputs, steps },
              abort.signal,
            );
            const durationMs = Date.now() - started;

            if (result.usage) {
              await this.journal.record(runId, "llm.usage", { nodeKey: key, ...result.usage });
            }
            await this.markStepSucceeded(runId, key, attempt, result.output, durationMs);
            await this.journal.record(runId, "step.succeeded", {
              nodeKey: key,
              attempt,
              output: result.output,
              durationMs,
            });
            steps[key] = { output: result.output };

            if (result.branch) {
              markBranchSelected(edgeStates, index.outgoing.get(key) ?? [], result.branch);
              await this.journal.record(runId, "branch.selected", { nodeKey: key, branch: result.branch });
            }

            succeeded = true;
            break;
          } catch (error) {
            if (abort.signal.aborted) {
              cancelled = true;
              break;
            }

            const serialized = serializeError(error);
            const durationMs = Date.now() - started;

            if (attempt < maxAttempts) {
              const delayMs = Math.min(4_000, 500 * 2 ** (attempt - 1));
              await this.markStepRetrying(runId, key, attempt, serialized);
              await this.journal.record(runId, "step.retry_scheduled", {
                nodeKey: key,
                attempt,
                delayMs,
                error: serialized,
              });
              this.logger.warn(`run ${runId} step ${key} attempt ${attempt} failed, retrying in ${delayMs}ms`);
              await sleep(delayMs);
            } else {
              await this.markStepFailed(runId, key, attempt, serialized, durationMs);
              await this.journal.record(runId, "step.failed", {
                nodeKey: key,
                attempt,
                error: serialized,
                durationMs,
              });
              await this.finishFailed(runId, serialized);
              return;
            }
          }
        }

        if (cancelled) {
          await this.finishCancelled(runId);
          return;
        }
        if (!succeeded) {
          await this.finishFailed(runId, { message: `步骤 ${key} 未完成` });
          return;
        }
      }

      if (abort.signal.aborted) {
        await this.finishCancelled(runId);
        return;
      }

      const respondNode = [...graph.nodes].reverse().find((node) => node.kind === "respond" && steps[node.key]);
      if (!respondNode) {
        await this.finishFailed(runId, { message: "没有响应步骤被执行" });
        return;
      }

      const response = steps[respondNode.key].output as { response?: unknown };
      const output = response?.response ?? null;
      await this.journal.record(
        runId,
        "run.succeeded",
        { output },
        {
          status: "succeeded",
          output: jsonValue(output),
          finishedAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      );
      this.logger.log(`run ${runId} succeeded in ${Date.now() - run.createdAt.getTime()}ms`);
    } catch (error) {
      if (abort.signal.aborted) {
        await this.finishCancelled(runId);
        return;
      }
      const serialized = serializeError(error);
      this.logger.error(`run ${runId} failed: ${serialized.message}`, error instanceof Error ? error.stack : undefined);
      await this.finishFailed(runId, serialized);
    } finally {
      clearInterval(heartbeat);
      clearInterval(cancelWatch);
      await this.releaseLease(runId, workerId);
    }
  }

  private async finishCancelled(runId: string): Promise<void> {
    const run = await this.prisma.run.findUnique({ where: { id: runId }, select: { status: true } });
    if (!run || run.status === "succeeded" || run.status === "failed" || run.status === "cancelled") return;
    await this.journal.record(
      runId,
      "run.cancelled",
      {},
      {
        status: "cancelled",
        finishedAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    );
  }

  private async finishFailed(runId: string, error: SerializedError): Promise<void> {
    const run = await this.prisma.run.findUnique({ where: { id: runId }, select: { status: true } });
    if (!run || run.status === "succeeded" || run.status === "failed" || run.status === "cancelled") return;
    await this.journal.record(
      runId,
      "run.failed",
      { error: error as unknown as Record<string, unknown> },
      {
        status: "failed",
        error: error as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    );
  }

  private async markStepRunning(runId: string, nodeKey: string, attempt: number): Promise<void> {
    await this.prisma.runStep.upsert({
      where: { runId_nodeKey: { runId, nodeKey } },
      update: {
        status: "running",
        attempt,
        startedAt: new Date(),
        finishedAt: null,
        durationMs: null,
        error: Prisma.JsonNull,
      },
      create: { runId, nodeKey, status: "running", attempt, startedAt: new Date() },
    });
  }

  private async markStepRetrying(
    runId: string,
    nodeKey: string,
    attempt: number,
    error: SerializedError,
  ): Promise<void> {
    await this.prisma.runStep.upsert({
      where: { runId_nodeKey: { runId, nodeKey } },
      update: {
        status: "running",
        attempt,
        error: error as unknown as Prisma.InputJsonValue,
      },
      create: {
        runId,
        nodeKey,
        status: "running",
        attempt,
        error: error as unknown as Prisma.InputJsonValue,
        startedAt: new Date(),
      },
    });
  }

  private async markStepSucceeded(
    runId: string,
    nodeKey: string,
    attempt: number,
    output: unknown,
    durationMs: number,
  ): Promise<void> {
    await this.prisma.runStep.upsert({
      where: { runId_nodeKey: { runId, nodeKey } },
      update: {
        status: "succeeded",
        attempt,
        output: jsonValue(output),
        error: Prisma.JsonNull,
        durationMs,
        finishedAt: new Date(),
      },
      create: {
        runId,
        nodeKey,
        status: "succeeded",
        attempt,
        output: jsonValue(output),
        durationMs,
        finishedAt: new Date(),
      },
    });
  }

  private async markStepFailed(
    runId: string,
    nodeKey: string,
    attempt: number,
    error: SerializedError,
    durationMs: number,
  ): Promise<void> {
    await this.prisma.runStep.upsert({
      where: { runId_nodeKey: { runId, nodeKey } },
      update: {
        status: "failed",
        attempt,
        error: error as unknown as Prisma.InputJsonValue,
        durationMs,
        finishedAt: new Date(),
      },
      create: {
        runId,
        nodeKey,
        status: "failed",
        attempt,
        error: error as unknown as Prisma.InputJsonValue,
        durationMs,
        finishedAt: new Date(),
      },
    });
  }

  private async markStepSkipped(runId: string, nodeKey: string): Promise<void> {
    await this.prisma.runStep.upsert({
      where: { runId_nodeKey: { runId, nodeKey } },
      update: {
        status: "skipped",
        output: Prisma.JsonNull,
        error: Prisma.JsonNull,
        finishedAt: new Date(),
      },
      create: {
        runId,
        nodeKey,
        status: "skipped",
        attempt: 0,
        finishedAt: new Date(),
      },
    });
  }

  private async isCancelRequested(runId: string): Promise<boolean> {
    const run = await this.prisma.run.findUnique({
      where: { id: runId },
      select: { cancelRequestedAt: true, status: true },
    });
    return !!run && (run.cancelRequestedAt !== null || run.status === "cancelled");
  }

  private async checkCancel(runId: string, abort: AbortController): Promise<void> {
    if (abort.signal.aborted) return;
    try {
      const run = await this.prisma.run.findUnique({
        where: { id: runId },
        select: { cancelRequestedAt: true, status: true },
      });
      if (!run) {
        abort.abort();
        return;
      }
      if (run.cancelRequestedAt || run.status === "cancelled") abort.abort();
    } catch {
      // A transient database error will be retried on the next tick.
    }
  }

  private async acquireLease(runId: string, owner: string): Promise<boolean> {
    const key = `run:lease:${runId}`;
    const acquired = await this.redis.client.set(key, owner, "PX", 20_000, "NX");
    if (acquired !== "OK") return false;
    await this.prisma.run.update({
      where: { id: runId },
      data: { leaseOwner: owner, leaseExpiresAt: new Date(Date.now() + 20_000) },
    });
    return true;
  }

  private async renewLease(runId: string, owner: string): Promise<void> {
    const key = `run:lease:${runId}`;
    try {
      const current = await this.redis.client.get(key);
      if (current !== owner) return;
      await this.redis.client.set(key, owner, "PX", 20_000);
      await this.prisma.run.updateMany({
        where: { id: runId, status: { in: ["running", "queued"] } },
        data: { leaseExpiresAt: new Date(Date.now() + 20_000) },
      });
    } catch {
      // The next heartbeat will try again.
    }
  }

  private async releaseLease(runId: string, owner: string): Promise<void> {
    const key = `run:lease:${runId}`;
    const script = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
    try {
      await this.redis.client.eval(script, 1, key, owner);
    } catch {
      // Lease expiry will release it.
    }
    try {
      await this.prisma.run.updateMany({
        where: { id: runId, leaseOwner: owner },
        data: { leaseOwner: null, leaseExpiresAt: null },
      });
    } catch {
      // The run may have been deleted.
    }
  }
}
