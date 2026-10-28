import { Controller, Get, Param, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import type { JournalEvent } from "@flowgate/schema";
import { CurrentUser, type AuthUser } from "../platform/public.decorator";
import { PrismaService } from "../platform/platform.providers";
import { RunsService } from "./runs.service";

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Controller()
export class StreamController {
  constructor(
    private readonly runs: RunsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("runs/:id/events")
  async events(
    @CurrentUser() user: AuthUser,
    @Param("id") runId: string,
    @Query("cursor") cursor: string | undefined,
    @Query("format") format: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const history = await this.runs.events(user.id, runId);

    if (format === "json") {
      response.json({ events: history, lastSeq: history.length > 0 ? history[history.length - 1].seq : 0 });
      return;
    }

    const parsedCursor = Number(cursor ?? "0");
    const startCursor = Number.isFinite(parsedCursor) && parsedCursor > 0 ? Math.floor(parsedCursor) : 0;

    response.status(200);
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();

    let closed = false;
    request.on("close", () => {
      closed = true;
    });

    let sent = startCursor;
    let lastWrite = Date.now();

    const writeEvent = (event: JournalEvent): void => {
      if (closed) return;
      response.write(`id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      sent = Math.max(sent, event.seq);
      lastWrite = Date.now();
    };

    try {
      for (const event of history) {
        if (event.seq > startCursor) writeEvent(event);
      }

      while (!closed) {
        const run = await this.prisma.run.findUnique({
          where: { id: runId },
          select: { status: true },
        });
        if (!run) break;

        const rows = await this.prisma.runEvent.findMany({
          where: { runId, seq: { gt: sent } },
          orderBy: { seq: "asc" },
          take: 200,
        });

        for (const row of rows) {
          writeEvent({
            v: 1,
            runId: row.runId,
            seq: row.seq,
            type: row.type as JournalEvent["type"],
            at: row.createdAt.toISOString(),
            payload: (row.payload ?? {}) as Record<string, unknown>,
          });
        }

        if (TERMINAL.has(run.status) && rows.length === 0) break;

        if (Date.now() - lastWrite > 15_000) {
          response.write(": keepalive\n\n");
          lastWrite = Date.now();
        }

        if (rows.length === 0) await sleep(600);
      }
    } catch (error) {
      if (!closed && !response.writableEnded) {
        response.write(
          `event: stream.error\ndata: ${JSON.stringify({
            message: error instanceof Error ? error.message : String(error),
          })}\n\n`,
        );
      }
    } finally {
      if (!response.writableEnded) response.end();
    }
  }
}
