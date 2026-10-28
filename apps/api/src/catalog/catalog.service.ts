import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import {
  canonicalJson,
  createDefaultGraph,
  pipelineGraphSchema,
  type PipelineGraph,
} from "@flowgate/schema";
import { PrismaService } from "../platform/platform.providers";
import { ProblemException } from "../platform/problem";
import { AccessService } from "../workspace/access.service";
import { slugify } from "../workspace/slug";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async listPipelines(userId: string, projectId: string) {
    await this.access.projectContext(userId, projectId);
    const rows = await this.prisma.pipeline.findMany({
      where: { projectId, archivedAt: null },
      include: {
        headRevision: { select: { id: true, number: true, createdAt: true } },
        _count: { select: { revisions: true, runs: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        headRevision: row.headRevision,
        revisionCount: row._count.revisions,
        runCount: row._count.runs,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    };
  }

  async createPipeline(userId: string, projectId: string, name: string) {
    const { project } = await this.access.projectContext(userId, projectId);
    await this.access.requireEditor(userId, project.workspaceId);
    const graph = createDefaultGraph();
    return this.prisma.pipeline.create({
      data: {
        projectId,
        name,
        slug: slugify(name, "pipeline"),
        draft: {
          create: {
            graph: graph as unknown as Prisma.InputJsonValue,
            schemaVersion: graph.schemaVersion,
          },
        },
      },
      include: { draft: { select: { rowVersion: true, updatedAt: true } } },
    });
  }

  async getPipeline(userId: string, pipelineId: string) {
    const { pipeline, member } = await this.access.pipelineContext(userId, pipelineId);
    const full = await this.prisma.pipeline.findUniqueOrThrow({
      where: { id: pipelineId },
      include: {
        project: { select: { id: true, name: true, workspaceId: true } },
        headRevision: { select: { id: true, number: true, createdAt: true, graphHash: true } },
        draft: { select: { rowVersion: true, updatedAt: true } },
        _count: { select: { revisions: true, runs: true } },
      },
    });
    return {
      ...full,
      role: member.role,
      revisionCount: full._count.revisions,
      runCount: full._count.runs,
    };
  }

  async renamePipeline(userId: string, pipelineId: string, name: string) {
    const { pipeline } = await this.access.pipelineContext(userId, pipelineId);
    await this.access.requireEditor(userId, pipeline.project.workspaceId);
    return this.prisma.pipeline.update({ where: { id: pipelineId }, data: { name } });
  }

  async deletePipeline(userId: string, pipelineId: string) {
    const { pipeline } = await this.access.pipelineContext(userId, pipelineId);
    await this.access.requireEditor(userId, pipeline.project.workspaceId);
    await this.prisma.pipeline.delete({ where: { id: pipelineId } });
    return { ok: true };
  }

  async getDraft(userId: string, pipelineId: string) {
    await this.access.pipelineContext(userId, pipelineId);
    let draft = await this.prisma.pipelineDraft.findUnique({ where: { pipelineId } });
    if (!draft) {
      const graph = createDefaultGraph();
      draft = await this.prisma.pipelineDraft.create({
        data: {
          pipelineId,
          graph: graph as unknown as Prisma.InputJsonValue,
          schemaVersion: graph.schemaVersion,
        },
      });
    }
    return {
      graph: draft.graph,
      schemaVersion: draft.schemaVersion,
      rowVersion: draft.rowVersion,
      updatedAt: draft.updatedAt,
    };
  }

  async saveDraft(userId: string, pipelineId: string, expectedRowVersion: number, graph: PipelineGraph) {
    const { pipeline } = await this.access.pipelineContext(userId, pipelineId);
    await this.access.requireEditor(userId, pipeline.project.workspaceId);

    const updated = await this.prisma.pipelineDraft.updateMany({
      where: { pipelineId, rowVersion: expectedRowVersion },
      data: {
        graph: graph as unknown as Prisma.InputJsonValue,
        schemaVersion: graph.schemaVersion,
        rowVersion: { increment: 1 },
      },
    });

    if (updated.count === 0) {
      const current = await this.prisma.pipelineDraft.findUnique({ where: { pipelineId } });
      if (!current) {
        const created = await this.prisma.pipelineDraft.create({
          data: {
            pipelineId,
            graph: graph as unknown as Prisma.InputJsonValue,
            schemaVersion: graph.schemaVersion,
          },
        });
        return {
          graph: created.graph,
          schemaVersion: created.schemaVersion,
          rowVersion: created.rowVersion,
          updatedAt: created.updatedAt,
        };
      }
      throw new ProblemException(
        409,
        "草稿已被更新",
        "另一个标签页或协作者已经保存了更新的版本，请刷新后再试。",
        [{ pointer: "/graph", message: `expected rowVersion ${expectedRowVersion}, current ${current.rowVersion}` }],
        "draft-conflict",
      );
    }

    const draft = await this.prisma.pipelineDraft.findUniqueOrThrow({ where: { pipelineId } });
    await this.prisma.pipeline.update({ where: { id: pipelineId }, data: { updatedAt: new Date() } });
    return {
      graph: draft.graph,
      schemaVersion: draft.schemaVersion,
      rowVersion: draft.rowVersion,
      updatedAt: draft.updatedAt,
    };
  }

  async publishRevision(userId: string, pipelineId: string, note?: string) {
    const { pipeline } = await this.access.pipelineContext(userId, pipelineId);
    await this.access.requireEditor(userId, pipeline.project.workspaceId);

    const draft = await this.prisma.pipelineDraft.findUnique({ where: { pipelineId } });
    if (!draft) {
      throw new ProblemException(409, "没有可发布的草稿", "请先保存一次草稿。", undefined, "draft-missing");
    }
    const graph = pipelineGraphSchema.parse(draft.graph);
    const graphHash = sha256(canonicalJson(graph));

    try {
      return await this.prisma.$transaction(async (tx) => {
        const aggregate = await tx.revision.aggregate({
          where: { pipelineId },
          _max: { number: true },
        });
        const number = (aggregate._max.number ?? 0) + 1;
        const revision = await tx.revision.create({
          data: {
            pipelineId,
            number,
            graph: graph as unknown as Prisma.InputJsonValue,
            graphHash,
            schemaVersion: graph.schemaVersion,
            kind: "manual",
            note,
            createdBy: userId,
          },
        });
        await tx.pipeline.update({
          where: { id: pipelineId },
          data: { headRevisionId: revision.id, updatedAt: new Date() },
        });
        return revision;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ProblemException(409, "版本号冲突", "请重试发布。", undefined, "revision-conflict");
      }
      throw error;
    }
  }

  async listRevisions(userId: string, pipelineId: string) {
    await this.access.pipelineContext(userId, pipelineId);
    const rows = await this.prisma.revision.findMany({
      where: { pipelineId },
      select: {
        id: true,
        number: true,
        kind: true,
        note: true,
        graphHash: true,
        createdAt: true,
        createdByUser: { select: { displayName: true } },
      },
      orderBy: { number: "desc" },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        number: row.number,
        kind: row.kind,
        note: row.note,
        graphHash: row.graphHash,
        createdAt: row.createdAt,
        author: row.createdByUser.displayName,
      })),
    };
  }

  async getRevision(userId: string, pipelineId: string, number: number) {
    await this.access.pipelineContext(userId, pipelineId);
    const revision = await this.prisma.revision.findUnique({
      where: { pipelineId_number: { pipelineId, number } },
    });
    if (!revision) {
      throw new ProblemException(404, "修订不存在", undefined, undefined, "not-found");
    }
    return revision;
  }
}
