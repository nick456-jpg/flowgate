import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService, RedisService } from "./platform.providers";
import { Public } from "./public.decorator";

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get("health")
  health() {
    return { status: "ok", uptime: process.uptime(), at: new Date().toISOString() };
  }

  @Public()
  @Get("health/ready")
  async ready() {
    await this.prisma.$queryRaw`SELECT 1`;
    const pong = await this.redis.client.ping();
    if (pong !== "PONG") {
      throw new ServiceUnavailableException("Redis is not ready");
    }
    return { status: "ready", db: "ok", redis: "ok" };
  }
}
