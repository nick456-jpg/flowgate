import { Global, Module } from "@nestjs/common";
import { Queue } from "bullmq";
import {
  CryptoService,
  PrismaService,
  QueueCloser,
  RUN_QUEUE,
  RedisService,
  runQueueProvider,
} from "./platform.providers";

@Global()
@Module({
  providers: [
    PrismaService,
    RedisService,
    CryptoService,
    runQueueProvider,
    {
      provide: QueueCloser,
      inject: [RUN_QUEUE],
      useFactory: (queue: Queue<{ runId: string }>) => new QueueCloser(queue),
    },
  ],
  exports: [PrismaService, RedisService, CryptoService, RUN_QUEUE],
})
export class PlatformModule {}
