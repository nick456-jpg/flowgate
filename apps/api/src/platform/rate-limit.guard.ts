import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Request } from "express";
import { RedisService } from "./platform.providers";
import { ProblemException } from "./problem";
import type { AuthUser } from "./public.decorator";

const WINDOW_MS = 60_000;
const LIMIT = 300;

const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  return 0
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return 1
`;

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (request.method === "OPTIONS") return true;

    const identity = request.user?.id ?? request.ip ?? "anonymous";
    const now = Date.now();
    const allowed = await this.redis.client.eval(
      SLIDING_WINDOW_LUA,
      1,
      `flowgate:rate:${identity}`,
      String(now),
      String(WINDOW_MS),
      String(LIMIT),
      `${now}:${randomUUID()}`,
    );

    if (Number(allowed) !== 1) {
      throw new ProblemException(
        429,
        "请求过于频繁",
        "每个身份每分钟最多 300 次请求，请稍后再试。",
        undefined,
        "rate-limited",
      );
    }
    return true;
  }
}
