import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from "@flowgate/schema";
import { ZodPipe } from "../platform/zod.pipe";
import { CurrentUser, Public, type AuthUser } from "../platform/public.decorator";
import { AuthService, REFRESH_COOKIE } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("register")
  async register(
    @Body(new ZodPipe(registerSchema)) body: RegisterInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.register(body);
    this.auth.setRefreshCookie(response, result.refreshToken);
    return { user: result.user, accessToken: result.accessToken };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post("login")
  async login(
    @Body(new ZodPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(body);
    this.auth.setRefreshCookie(response, result.refreshToken);
    return { user: result.user, accessToken: result.accessToken };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post("refresh")
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const result = await this.auth.refresh(request.cookies?.[REFRESH_COOKIE]);
      this.auth.setRefreshCookie(response, result.refreshToken);
      return { user: result.user, accessToken: result.accessToken };
    } catch (error) {
      this.auth.clearRefreshCookie(response);
      throw error;
    }
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post("logout")
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(request.cookies?.[REFRESH_COOKIE]);
    this.auth.clearRefreshCookie(response);
    return { ok: true };
  }

  @Get("me")
  async me(@CurrentUser() user: AuthUser) {
    return { user: await this.auth.me(user.id) };
  }
}
