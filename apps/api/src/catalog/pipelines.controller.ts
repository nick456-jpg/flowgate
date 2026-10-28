import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
} from "@nestjs/common";
import {
  createPipelineSchema,
  createRevisionSchema,
  updateDraftSchema,
  updatePipelineSchema,
  type CreatePipelineInput,
  type CreateRevisionInput,
  type UpdateDraftInput,
} from "@flowgate/schema";
import { CurrentUser, type AuthUser } from "../platform/public.decorator";
import { ProblemException } from "../platform/problem";
import { ZodPipe } from "../platform/zod.pipe";
import { CatalogService } from "./catalog.service";

function parseIfMatch(value: string | undefined): number {
  if (!value) {
    throw new ProblemException(
      428,
      "缺少版本号",
      "保存草稿需要 If-Match 请求头，值为当前草稿的 rowVersion。",
      undefined,
      "precondition-required",
    );
  }
  const cleaned = value.trim().replace(/^W\//, "").replace(/"/g, "");
  const version = Number(cleaned);
  if (!Number.isInteger(version) || version < 1) {
    throw new ProblemException(400, "If-Match 版本号不合法", "请传入正整数 rowVersion。", undefined, "bad-precondition");
  }
  return version;
}

@Controller()
export class PipelinesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("projects/:projectId/pipelines")
  async list(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.catalog.listPipelines(user.id, projectId);
  }

  @Post("projects/:projectId/pipelines")
  async create(
    @CurrentUser() user: AuthUser,
    @Param("projectId") projectId: string,
    @Body(new ZodPipe(createPipelineSchema)) body: CreatePipelineInput,
  ) {
    return this.catalog.createPipeline(user.id, projectId, body.name);
  }

  @Get("pipelines/:id")
  async get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.catalog.getPipeline(user.id, id);
  }

  @Patch("pipelines/:id")
  async rename(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodPipe(updatePipelineSchema)) body: { name: string },
  ) {
    return this.catalog.renamePipeline(user.id, id, body.name);
  }

  @Delete("pipelines/:id")
  async remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.catalog.deletePipeline(user.id, id);
  }

  @Get("pipelines/:id/draft")
  async draft(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.catalog.getDraft(user.id, id);
  }

  @Put("pipelines/:id/draft")
  async saveDraft(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body(new ZodPipe(updateDraftSchema)) body: UpdateDraftInput,
  ) {
    const version = parseIfMatch(ifMatch);
    return this.catalog.saveDraft(user.id, id, version, body.graph);
  }

  @Get("pipelines/:id/revisions")
  async revisions(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.catalog.listRevisions(user.id, id);
  }

  @Post("pipelines/:id/revisions")
  async publish(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodPipe(createRevisionSchema)) body: CreateRevisionInput,
  ) {
    return this.catalog.publishRevision(user.id, id, body.note);
  }

  @Get("pipelines/:id/revisions/:number")
  async revision(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("number", ParseIntPipe) number: number,
  ) {
    return this.catalog.getRevision(user.id, id, number);
  }
}
