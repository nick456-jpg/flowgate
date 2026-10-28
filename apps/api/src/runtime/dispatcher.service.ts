import { Inject, Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";
import { RUN_QUEUE } from "../platform/platform.providers";

@Injectable()
export class DispatcherService {
  constructor(@Inject(RUN_QUEUE) private readonly queue: Queue<{ runId: string }>) {}

  async enqueue(runId: string, delayMs = 0): Promise<void> {
    await this.queue.add(
      "execute",
      { runId },
      {
        jobId: runId,
        removeOnComplete: true,
        removeOnFail: 100,
        ...(delayMs > 0 ? { delay: delayMs } : {}),
      },
    );
  }

  async remove(runId: string): Promise<void> {
    const job = await this.queue.getJob(runId);
    if (job) {
      try {
        await job.remove();
      } catch {
        // The job may already be active; the executor observes the cancellation flag.
      }
    }
  }
}
