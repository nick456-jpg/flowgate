import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { JournalEventType } from "@flowgate/schema";
import { PrismaService, RedisService } from "../platform/platform.providers";

@Injectable()
export class JournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private async insert(
    tx: Prisma.TransactionClient,
    runId: string,
    type: JournalEventType,
    payload: Record<string, unknown>,
  ) {
    const bumped = await tx.run.update({
      where: { id: runId },
      data: { eventSeq: { increment: 1 } },
      select: { eventSeq: true },
    });
    const event = await tx.runEvent.create({
      data: {
        runId,
        seq: bumped.eventSeq,
        type,
        payload: payload as Prisma.InputJsonValue,
        schemaVersion: 1,
      },
      select: { seq: true, createdAt: true },
    });
    return { seq: event.seq, at: event.createdAt.toISOString() };
  }

  async appendInTransaction(
    tx: Prisma.TransactionClient,
    runId: string,
    type: JournalEventType,
    payload: Record<string, unknown>,
  ) {
    return this.insert(tx, runId, type, payload);
  }

  async notify(runId: string, seq: number): Promise<void> {
    await this.redis.client.publish(`run:${runId}`, String(seq));
  }

  async record(
    runId: string,
    type: JournalEventType,
    payload: Record<string, unknown>,
    update?: Prisma.RunUpdateInput,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const bumped = await tx.run.update({
        where: { id: runId },
        data: { ...(update ?? {}), eventSeq: { increment: 1 } },
        select: { eventSeq: true },
      });
      const event = await tx.runEvent.create({
        data: {
          runId,
          seq: bumped.eventSeq,
          type,
          payload: payload as Prisma.InputJsonValue,
          schemaVersion: 1,
        },
        select: { seq: true, createdAt: true },
      });
      return { seq: event.seq, at: event.createdAt.toISOString() };
    });
    await this.notify(runId, result.seq);
    return result;
  }
}
