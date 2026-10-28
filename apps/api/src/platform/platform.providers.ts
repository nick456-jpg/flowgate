import { Injectable, OnModuleDestroy, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import { Queue, type ConnectionOptions } from "bullmq";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import Redis from "ioredis";

export const RUN_QUEUE = Symbol("RUN_QUEUE");

export function redisConnectionOptions(url: string): ConnectionOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: parsed.pathname && parsed.pathname !== "/" ? Number(parsed.pathname.slice(1)) : 0,
    maxRetriesPerRequest: null,
  };
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>("REDIS_URL"), {
      maxRetriesPerRequest: null,
    });
  }

  createSubscriber(): Redis {
    return this.client.duplicate();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}

@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    this.key = Buffer.from(config.getOrThrow<string>("ENCRYPTION_KEY"), "hex");
  }

  encrypt(plaintext: string): {
    ciphertext: Uint8Array<ArrayBuffer>;
    iv: Uint8Array<ArrayBuffer>;
    version: number;
  } {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const ciphertext = new Uint8Array(encrypted.length + tag.length);
    ciphertext.set(encrypted, 0);
    ciphertext.set(tag, encrypted.length);
    const ivBytes = new Uint8Array(iv.length);
    ivBytes.set(iv);
    return { ciphertext, iv: ivBytes, version: 1 };
  }

  decrypt(ciphertext: Uint8Array, iv: Uint8Array): string {
    const encrypted = Buffer.from(ciphertext);
    const tag = encrypted.subarray(encrypted.length - 16);
    const payload = encrypted.subarray(0, encrypted.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(payload), decipher.final()]).toString("utf8");
  }
}

export const runQueueProvider = {
  provide: RUN_QUEUE,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Queue<{ runId: string }> =>
    new Queue<{ runId: string }>("run.execute", {
      connection: redisConnectionOptions(config.getOrThrow<string>("REDIS_URL")),
    }),
};

@Injectable()
export class QueueCloser implements OnModuleDestroy {
  constructor(@Inject(RUN_QUEUE) private readonly queue: Queue<{ runId: string }>) {}

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
