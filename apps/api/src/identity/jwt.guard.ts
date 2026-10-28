import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { PrismaService } from "../platform/platform.providers";
import { ProblemException } from "../platform/problem";
import { IS_PUBLIC_KEY, type AuthUser } from "../platform/public.decorator";

type AccessTokenPayload = {
  sub: string;
  sid: string;
  email: string;
  name: string;
};

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new ProblemException(401, "未认证", "缺少访问令牌。", undefined, "unauthenticated");
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(header.slice("Bearer ".length));
    } catch {
      throw new ProblemException(401, "访问令牌无效", "请刷新登录状态。", undefined, "invalid-token");
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      select: {
        id: true,
        userId: true,
        revokedAt: true,
        expiresAt: true,
        user: { select: { id: true, email: true, displayName: true } },
      },
    });

    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new ProblemException(401, "登录已过期", "请重新登录。", undefined, "session-expired");
    }

    request.user = {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      sessionId: session.id,
    };
    return true;
  }
}
