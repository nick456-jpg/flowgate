import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Worker } from "bullmq";
import { PrismaService, redisConnectionOptions } from "../platform/platform.providers";
import { DispatcherService } from "./dispatcher.service";
import { ExecutorService } from "./executor.service";
import { JournalService } from "./journal.service";

@Injectable()
export class RunWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RunWorkerService.name);
  private worker?: Worker<{ runId: string }>;
  private sweeper?: NodeJS.Timeout;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly executor: ExecutorService,
    private readonly journal: JournalService,
    private readonly dispatcher: DispatcherService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>("RUNTIME_ROLE") !== "worker") return;

    const connection = redisConnectionOptions(this.config.getOrThrow<string>("REDIS_URL"));
    this.worker = new Worker<{ runId: string }>(
      "run.execute",
      async (job) => {
        await this.executor.execute(job.data.runId);
      },
      {
        connection,
        concurrency: this.config.get<number>("RUN_CONCURRENCY") ?? 2,
      },
    );

    this.worker.on("failed", (job, error) => {
      this.logger.error(`job ${job?.id ?? "unknown"} failed: ${error.message}`, error.stack);
    });
    this.worker.on("error", (error) => {
      this.logger.error(`worker error: ${error.message}`, error.stack);
    });

    this.sweeper = setInterval(() => void this.sweep(), 15_000);
    this.sweeper.unref();
    this.logger.log("run worker is listening on run.execute");
  }

  private async sweep(): Promise<void> {
    try {
      const stale = await this.prisma.run.findMany({
        where: { status: "running", leaseExpiresAt: { lt: new Date() } },
        take: 20,
        select: { id: true, leaseOwner: true },
      });
      for (const run of stale) {
        await this.journal.record(
          run.id,
          "run.recovered",
          { previousLease: run.leaseOwner },
          { status: "queued", leaseOwner: null, leaseExpiresAt: null },
        );
        await this.dispatcher.enqueue(run.id);
        this.logger.warn(`requeued stale run ${run.id}`);
      }

      const queued = await this.prisma.run.findMany({
        where: { status: "queued", createdAt: { lt: new Date(Date.now() - 30_000) } },
        take: 20,
        select: { id: true },
      });
      for (const run of queued) {
        await this.dispatcher.enqueue(run.id);
      }
    } catch (error) {
      this.logger.error(`sweeper failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.sweeper) clearInterval(this.sweeper);
    if (this.worker) await this.worker.close();
  }
}
