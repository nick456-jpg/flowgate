import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import {
  canonicalJson,
  pipelineGraphSchema,
  runStatusSchema,
  type CreateRunInput,
  type ForkRunInput,
} from "@flowgate/schema";
import { PrismaService } from "../platform/platform.providers";
import { ProblemException } from "../platform/problem";
import { AccessService } from "../workspace/access.service";
import { DispatcherService } from "./dispatcher.service";
import { HistoryService } from "./history.service";
import { JournalService } from "./journal.service";

export type RunListQuery = {
  pipelineId?: string;
  projectId?: string;
  status?: string;
  cursor?: string;
  limit?: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class RunsService {
  private readonly logger = new Logger(RunsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly journal: JournalService,
    private readonly history: HistoryService,
    private readonly dispatcher: DispatcherService,
  ) {}

  private async enqueueSafely(runId: string): Promise<void> {
    try {
      await this.dispatcher.enqueue(runId);
    } catch (error) {
      this.logger.warn(
        `failed to enqueue run ${runId}; the sweeper will retry: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async loadRun(runId: string) {
    const run = await this.prisma.run.findUniqueOrThrow({
      where: { id: runId },
      include: {
        pipeline: { select: { id: true, name: true, projectId: true } },
        revision: { select: { id: true, number: true, graphHash: true } },
        parent: { select: { id: true, status: true, createdAt: true } },
        steps: { orderBy: { startedAt: "asc" } },
      },
    });
    return {
      ...run,
      durationMs:
        run.startedAt && run.finishedAt ? run.finishedAt.getTime() - run.startedAt.getTime() : null,
    };
  }

  async create(userId: string, pipelineId: string, body: CreateRunInput, rawKey: string | undefined) {
    const { pipeline } = await this.access.pipelineContext(userId, pipelineId);
    const key = rawKey?.trim();
    if (!key || key.length > 120) {
      throw new ProblemException(
        400,
        "缺少 Idempotency-Key",
        "创建运行必须带 Idempotency-Key 请求头（1-120 字符）。",
        undefined,
        "idempotency-key-required",
      );
    }

    let revisionId = body.revisionId;
    if (revisionId) {
      const revision = await this.prisma.revision.findFirst({
        where: { id: revisionId, pipelineId },
        select: { id: true },
      });
      if (!revision) {
        throw new ProblemException(422, "修订不属于该管道", undefined, undefined, "revision-mismatch");
      }
    } else {
      const head = pipeline.headRevisionId;
      if (!head) {
        throw new ProblemException(
          409,
          "还没有可运行的修订",
          "请先在编辑器中发布一版修订。",
          undefined,
          "head-revision-missing",
        );
      }
      revisionId = head;
    }

    const inputs = body.inputs ?? {};
    const requestHash = sha256(canonicalJson({ revisionId, inputs }));

    const existing = await this.prisma.run.findUnique({
      where: { pipelineId_idempotencyKey: { pipelineId, idempotencyKey: key } },
      include: { steps: true },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ProblemException(
          409,
          "幂等键冲突",
          "同一个 Idempotency-Key 已被不同的运行参数使用。",
          undefined,
          "idempotency-conflict",
        );
      }
      return { run: existing, created: false };
    }

    try {
      const run = await this.prisma.run.create({
        data: {
          pipelineId,
          revisionId,
          status: "queued",
          trigger: "manual",
          inputs: inputs as unknown as Prisma.InputJsonValue,
          idempotencyKey: key,
          requestHash,
          createdBy: userId,
          eventSeq: 1,
          events: {
            create: {
              seq: 1,
              type: "run.queued",
              payload: { revisionId, trigger: "manual" } as Prisma.InputJsonValue,
              schemaVersion: 1,
            },
          },
        },
        include: { steps: true },
      });
      await this.enqueueSafely(run.id);
      return { run, created: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const raced = await this.prisma.run.findUnique({
          where: { pipelineId_idempotencyKey: { pipelineId, idempotencyKey: key } },
          include: { steps: true },
        });
        if (raced) {
          if (raced.requestHash !== requestHash) {
            throw new ProblemException(409, "幂等键冲突", undefined, undefined, "idempotency-conflict");
          }
          return { run: raced, created: false };
        }
      }
      throw error;
    }
  }

  async list(userId: string, query: RunListQuery) {
    const limit = Math.min(Math.max(Number(query.limit ?? 20) || 20, 1), 100);
    let where: Prisma.RunWhereInput;

    if (query.pipelineId) {
      await this.access.pipelineContext(userId, query.pipelineId);
      where = { pipelineId: query.pipelineId };
    } else if (query.projectId) {
      await this.access.projectContext(userId, query.projectId);
      where = { pipeline: { projectId: query.projectId } };
    } else {
      throw new ProblemException(
        400,
        "缺少过滤条件",
        "请提供 pipelineId 或 projectId。",
        undefined,
        "filter-required",
      );
    }

    if (query.status) {
      const parsed = runStatusSchema.safeParse(query.status);
      if (!parsed.success) {
        throw new ProblemException(400, "运行状态不合法", undefined, undefined, "invalid-status");
      }
      where.status = parsed.data;
    }

    let cursorId: string | undefined;
    if (query.cursor) {
      const decoded = Buffer.from(query.cursor, "base64url").toString("utf8");
      if (!UUID_PATTERN.test(decoded)) {
        throw new ProblemException(400, "游标不合法", undefined, undefined, "invalid-cursor");
      }
      cursorId = decoded;
    }

    const rows = await this.prisma.run.findMany({
      where,
      include: {
        pipeline: { select: { id: true, name: true, projectId: true } },
        steps: { select: { nodeKey: true, status: true, attempt: true, durationMs: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((run) => ({
      id: run.id,
      status: run.status,
      trigger: run.trigger,
      revisionId: run.revisionId,
      parentRunId: run.parentRunId,
      pipeline: run.pipeline,
      inputs: run.inputs,
      output: run.output,
      error: run.error,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      durationMs:
        run.startedAt && run.finishedAt ? run.finishedAt.getTime() - run.startedAt.getTime() : null,
      steps: run.steps,
    }));

    return {
      items,
      nextCursor:
        hasMore && items.length > 0
          ? Buffer.from(items[items.length - 1].id).toString("base64url")
          : null,
    };
  }

  async get(userId: string, runId: string) {
    await this.access.runContext(userId, runId);
    return this.loadRun(runId);
  }

  async events(userId: string, runId: string) {
    await this.access.runContext(userId, runId);
    return this.history.history(runId);
  }

  async cancel(userId: string, runId: string) {
    const { run } = await this.access.runContext(userId, runId);
    if (run.status === "succeeded" || run.status === "failed" || run.status === "cancelled") {
      return { run: await this.loadRun(runId), cancelled: false };
    }

    if (run.status === "queued") {
      const result = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.run.updateMany({
          where: { id: runId, status: "queued" },
          data: { status: "cancelled", cancelRequestedAt: new Date(), finishedAt: new Date() },
        });
        if (updated.count === 0) return { queued: false, seq: 0 };
        const event = await this.journal.appendInTransaction(tx, runId, "run.cancelled", {});
        return { queued: true, seq: event.seq };
      });

      if (result.queued) {
        await this.dispatcher.remove(runId);
        await this.journal.notify(runId, result.seq);
        return { run: await this.loadRun(runId), cancelled: true };
      }

      const current = await this.prisma.run.findUnique({
        where: { id: runId },
        select: { status: true },
      });
      if (
        !current ||
        current.status === "succeeded" ||
        current.status === "failed" ||
        current.status === "cancelled"
      ) {
        return { run: await this.loadRun(runId), cancelled: false };
      }
    }

    await this.journal.record(runId, "run.cancel_requested", {}, { cancelRequestedAt: new Date() });
    return { run: await this.loadRun(runId), cancelled: true };
  }

  async resume(userId: string, runId: string) {
    const { run } = await this.access.runContext(userId, runId);
    if (run.status !== "failed" && run.status !== "cancelled") {
      throw new ProblemException(
        409,
        "当前运行不可恢复",
        "只有失败或已取消的运行可以恢复。",
        undefined,
        "run-not-resumable",
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.run.update({
        where: { id: runId },
        data: {
          status: "queued",
          cancelRequestedAt: null,
          error: Prisma.JsonNull,
          output: Prisma.JsonNull,
          finishedAt: null,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      return this.journal.appendInTransaction(tx, runId, "run.queued", { reason: "resume" });
    });

    await this.journal.notify(runId, result.seq);
    await this.enqueueSafely(runId);
    return { run: await this.loadRun(runId) };
  }

  async fork(userId: string, runId: string, body: ForkRunInput) {
    const { run: parent } = await this.access.runContext(userId, runId);
    const parentWithRevision = await this.prisma.run.findUniqueOrThrow({
      where: { id: runId },
      include: { revision: { select: { graph: true } } },
    });
    const graph = pipelineGraphSchema.parse(parentWithRevision.revision.graph);
    if (!graph.nodes.some((node) => node.key === body.fromStep)) {
      throw new ProblemException(422, "分叉点不存在", `图中没有步骤 ${body.fromStep}。`, undefined, "fork-step-missing");
    }

    const history = await this.history.history(runId);
    const entered = history.find(
      (event) => event.type === "step.entered" && event.payload.nodeKey === body.fromStep,
    );
    const maxSeq = history.length > 0 ? history[history.length - 1].seq : 0;
    const parentSeq = entered ? Math.max(0, entered.seq - 1) : maxSeq;

    const child = await this.prisma.run.create({
      data: {
        pipelineId: parent.pipelineId,
        revisionId: parent.revisionId,
        status: "queued",
        trigger: "fork",
        inputs: parent.inputs as Prisma.InputJsonValue,
        idempotencyKey: `fork-${randomUUID()}`,
        requestHash: sha256(canonicalJson({ parentRunId: parent.id, fromStep: body.fromStep, parentSeq })),
        parentRunId: parent.id,
        parentSeq,
        createdBy: userId,
        eventSeq: parentSeq,
      },
    });

    await this.journal.record(child.id, "run.queued", {
      revisionId: parent.revisionId,
      trigger: "fork",
      parentRunId: parent.id,
      parentSeq,
    });
    await this.enqueueSafely(child.id);
    return { run: await this.loadRun(child.id) };
  }
}
