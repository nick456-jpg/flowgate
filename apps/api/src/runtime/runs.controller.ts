import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import {
  createRunSchema,
  forkRunSchema,
  type CreateRunInput,
  type ForkRunInput,
} from "@flowgate/schema";
import { CurrentUser, type AuthUser } from "../platform/public.decorator";
import { ZodPipe } from "../platform/zod.pipe";
import { RunsService } from "./runs.service";

@Controller()
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  @Post("pipelines/:id/runs")
  async create(
    @CurrentUser() user: AuthUser,
    @Param("id") pipelineId: string,
    @Body(new ZodPipe(createRunSchema)) body: CreateRunInput,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.runs.create(user.id, pipelineId, body, idempotencyKey);
    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return { run: result.run };
  }

  @Get("runs")
  async list(
    @CurrentUser() user: AuthUser,
    @Query("pipelineId") pipelineId?: string,
    @Query("projectId") projectId?: string,
    @Query("status") status?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.runs.list(user.id, { pipelineId, projectId, status, cursor, limit });
  }

  @Get("runs/:id")
  async get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.runs.get(user.id, id);
  }

  @HttpCode(HttpStatus.OK)
  @Post("runs/:id/cancel")
  async cancel(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.runs.cancel(user.id, id);
  }

  @HttpCode(HttpStatus.OK)
  @Post("runs/:id/resume")
  async resume(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.runs.resume(user.id, id);
  }

  @Post("runs/:id/fork")
  async fork(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodPipe(forkRunSchema)) body: ForkRunInput,
  ) {
    return this.runs.fork(user.id, id, body);
  }
}
