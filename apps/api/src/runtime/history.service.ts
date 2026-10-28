import { Injectable } from "@nestjs/common";
import type { JournalEvent, JournalEventType } from "@flowgate/schema";
import { PrismaService } from "../platform/platform.providers";
import { ProblemException } from "../platform/problem";

const MAX_FORK_DEPTH = 10;

@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  private toJournalEvent(row: {
    runId: string;
    seq: number;
    type: string;
    payload: unknown;
    createdAt: Date;
  }): JournalEvent {
    return {
      v: 1,
      runId: row.runId,
      seq: row.seq,
      type: row.type as JournalEventType,
      at: row.createdAt.toISOString(),
      payload: (row.payload ?? {}) as Record<string, unknown>,
    };
  }

  private async collect(runId: string, maxSeq: number | null, depth: number): Promise<JournalEvent[]> {
    if (depth > MAX_FORK_DEPTH) {
      throw new ProblemException(409, "分叉层级过深", `最多支持 ${MAX_FORK_DEPTH} 层分叉。`, undefined, "fork-too-deep");
    }

    const run = await this.prisma.run.findUnique({
      where: { id: runId },
      select: { id: true, parentRunId: true, parentSeq: true },
    });
    if (!run) {
      throw new ProblemException(404, "运行不存在", undefined, undefined, "not-found");
    }

    const own = await this.prisma.runEvent.findMany({
      where: {
        runId,
        ...(maxSeq === null ? {} : { seq: { lte: maxSeq } }),
      },
      orderBy: { seq: "asc" },
    });

    const events = own.map((row) => this.toJournalEvent(row));
    if (!run.parentRunId) return events;

    const parentMax =
      maxSeq === null
        ? run.parentSeq
        : run.parentSeq === null
          ? maxSeq
          : Math.min(run.parentSeq, maxSeq);

    const inherited = await this.collect(run.parentRunId, parentMax, depth + 1);
    return [...inherited, ...events].sort((a, b) => a.seq - b.seq);
  }

  async history(runId: string): Promise<JournalEvent[]> {
    return this.collect(runId, null, 0);
  }
}
