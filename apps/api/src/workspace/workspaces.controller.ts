import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";
import {
  createProjectSchema,
  createWorkspaceSchema,
  llmConnectionSchema,
  type CreateProjectInput,
  type CreateWorkspaceInput,
  type LlmConnectionInput,
} from "@flowgate/schema";
import { CurrentUser, type AuthUser } from "../platform/public.decorator";
import { CryptoService, PrismaService } from "../platform/platform.providers";
import { ProblemException } from "../platform/problem";
import { ZodPipe } from "../platform/zod.pipe";
import { AccessService } from "./access.service";
import { slugify } from "./slug";

@Controller("workspaces")
export class WorkspacesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly crypto: CryptoService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.workspaceMember.findMany({
      where: { userId: user.id },
      include: { workspace: true },
      orderBy: { createdAt: "asc" },
    });
    return {
      items: rows.map((row) => ({ ...row.workspace, role: row.role })),
    };
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createWorkspaceSchema)) body: CreateWorkspaceInput,
  ) {
    const workspace = await this.prisma.$transaction(async (tx) => {
      const created = await tx.workspace.create({
        data: { name: body.name, slug: slugify(body.name, "workspace"), createdBy: user.id },
      });
      await tx.workspaceMember.create({
        data: { workspaceId: created.id, userId: user.id, role: "owner" },
      });
      return created;
    });
    return { ...workspace, role: "owner" };
  }

  @Get(":id")
  async get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const member = await this.access.membership(user.id, id);
    const workspace = await this.prisma.workspace.findUniqueOrThrow({ where: { id } });
    return { ...workspace, role: member.role };
  }

  @Get(":id/members")
  async members(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    await this.access.membership(user.id, id);
    const rows = await this.prisma.workspaceMember.findMany({
      where: { workspaceId: id },
      include: { user: { select: { id: true, email: true, displayName: true } } },
      orderBy: { createdAt: "asc" },
    });
    return {
      items: rows.map((row) => ({
        userId: row.user.id,
        email: row.user.email,
        displayName: row.user.displayName,
        role: row.role,
        joinedAt: row.createdAt,
      })),
    };
  }

  @Get(":id/llm-connections")
  async listConnections(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    await this.access.membership(user.id, id);
    const rows = await this.prisma.llmConnection.findMany({
      where: { workspaceId: id },
      select: { id: true, provider: true, baseUrl: true, model: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    });
    return { items: rows.map((row) => ({ ...row, hasSecret: true })) };
  }

  @Post(":id/llm-connections")
  async upsertConnection(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodPipe(llmConnectionSchema)) body: LlmConnectionInput,
  ) {
    await this.access.requireEditor(user.id, id);
    const encrypted = this.crypto.encrypt(body.apiKey);
    const connection = await this.prisma.llmConnection.upsert({
      where: { workspaceId_provider: { workspaceId: id, provider: body.provider } },
      update: {
        baseUrl: body.baseUrl,
        model: body.model,
        secretCt: encrypted.ciphertext,
        secretIv: encrypted.iv,
        keyVersion: encrypted.version,
      },
      create: {
        workspaceId: id,
        provider: body.provider,
        baseUrl: body.baseUrl,
        model: body.model,
        secretCt: encrypted.ciphertext,
        secretIv: encrypted.iv,
        keyVersion: encrypted.version,
      },
      select: { id: true, provider: true, baseUrl: true, model: true, updatedAt: true },
    });
    return { ...connection, hasSecret: true };
  }

  @Delete(":id/llm-connections/:connectionId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConnection(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("connectionId") connectionId: string,
  ) {
    await this.access.requireEditor(user.id, id);
    const result = await this.prisma.llmConnection.deleteMany({
      where: { id: connectionId, workspaceId: id },
    });
    if (result.count === 0) {
      throw new ProblemException(404, "模型连接不存在", undefined, undefined, "not-found");
    }
  }
}

@Controller()
export class ProjectsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  @Get("workspaces/:workspaceId/projects")
  async list(@CurrentUser() user: AuthUser, @Param("workspaceId") workspaceId: string) {
    await this.access.membership(user.id, workspaceId);
    const rows = await this.prisma.project.findMany({
      where: { workspaceId },
      include: { _count: { select: { pipelines: true } } },
      orderBy: { updatedAt: "desc" },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        pipelineCount: row._count.pipelines,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    };
  }

  @Post("workspaces/:workspaceId/projects")
  async create(
    @CurrentUser() user: AuthUser,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodPipe(createProjectSchema)) body: CreateProjectInput,
  ) {
    await this.access.requireEditor(user.id, workspaceId);
    const project = await this.prisma.project.create({
      data: { workspaceId, name: body.name, slug: slugify(body.name, "project") },
    });
    return project;
  }

  @Get("projects/:id")
  async get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const { project, member } = await this.access.projectContext(user.id, id);
    return { ...project, role: member.role };
  }

  @Delete("projects/:id")
  async remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const { project } = await this.access.projectContext(user.id, id);
    await this.access.requireEditor(user.id, project.workspaceId);
    await this.prisma.project.delete({ where: { id } });
    return { ok: true };
  }
}
