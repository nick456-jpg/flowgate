import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@prisma/client";
import { Algorithm, hash, verify } from "@node-rs/argon2";
import type { Response } from "express";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PrismaService } from "../platform/platform.providers";
import { ProblemException } from "../platform/problem";
import type { AuthUser } from "../platform/public.decorator";
import type { LoginInput, RegisterInput } from "@flowgate/schema";

export const REFRESH_COOKIE = "fg_rt";
export const REFRESH_COOKIE_PATH = "/v1/auth";
const SESSION_DAYS = 14;

type SessionUser = {
  id: string;
  email: string;
  displayName: string;
};

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function publicUser(user: SessionUser) {
  return { id: user.id, email: user.email, displayName: user.displayName };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private async issueSession(user: SessionUser, familyId?: string) {
    const refreshToken = randomBytes(32).toString("base64url");
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshHash: digest(refreshToken),
        familyId: familyId ?? randomUUID(),
        expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      sid: session.id,
      email: user.email,
      name: user.displayName,
    });
    return { accessToken, refreshToken };
  }

  setRefreshCookie(response: Response, token: string): void {
    response.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.config.get<boolean>("COOKIE_SECURE") === true,
      path: REFRESH_COOKIE_PATH,
      maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    });
  }

  clearRefreshCookie(response: Response): void {
    response.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }

  private async hashPassword(password: string): Promise<string> {
    return hash(password, {
      algorithm: Algorithm.Argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  async register(input: RegisterInput) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new ProblemException(409, "邮箱已被注册", "请直接登录或更换邮箱。", undefined, "email-taken");
    }

    const passwordHash = await this.hashPassword(input.password);
    let user: SessionUser;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: input.email,
            passwordHash,
            displayName: input.displayName,
          },
          select: { id: true, email: true, displayName: true },
        });
        const workspace = await tx.workspace.create({
          data: {
            name: `${input.displayName} 的工作区`,
            slug: `ws-${randomBytes(6).toString("hex")}`,
            createdBy: created.id,
          },
        });
        await tx.workspaceMember.create({
          data: { workspaceId: workspace.id, userId: created.id, role: "owner" },
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ProblemException(409, "邮箱已被注册", undefined, undefined, "email-taken");
      }
      throw error;
    }

    const tokens = await this.issueSession(user);
    return { user: publicUser(user), ...tokens };
  }

  async login(input: LoginInput) {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, email: true, displayName: true, passwordHash: true },
    });
    if (!user) {
      throw new ProblemException(401, "邮箱或密码不正确", undefined, undefined, "invalid-credentials");
    }
    const valid = await verify(user.passwordHash, input.password);
    if (!valid) {
      throw new ProblemException(401, "邮箱或密码不正确", undefined, undefined, "invalid-credentials");
    }
    const tokens = await this.issueSession(user);
    return { user: publicUser(user), ...tokens };
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) {
      throw new ProblemException(401, "登录已过期", "请重新登录。", undefined, "session-expired");
    }
    const session = await this.prisma.session.findUnique({
      where: { refreshHash: digest(refreshToken) },
      include: { user: { select: { id: true, email: true, displayName: true } } },
    });
    if (!session) {
      throw new ProblemException(401, "登录已过期", "请重新登录。", undefined, "session-expired");
    }
    if (session.revokedAt) {
      await this.prisma.session.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new ProblemException(401, "会话已失效", "检测到重复使用的刷新令牌，已注销该会话族。", undefined, "session-reused");
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      throw new ProblemException(401, "登录已过期", "请重新登录。", undefined, "session-expired");
    }

    await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    const tokens = await this.issueSession(session.user, session.familyId);
    return { user: publicUser(session.user), ...tokens };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.prisma.session.updateMany({
      where: { refreshHash: digest(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, displayName: true },
    });
    if (!user) {
      throw new ProblemException(401, "用户不存在", undefined, undefined, "unauthenticated");
    }
    return { ...user, sessionId: "" };
  }
}
