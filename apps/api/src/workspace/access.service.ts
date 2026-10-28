import { Injectable } from "@nestjs/common";
import { PrismaService } from "../platform/platform.providers";
import { ProblemException } from "../platform/problem";

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async membership(userId: string, workspaceId: string) {
    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!member) {
      throw new ProblemException(404, "工作区不存在", "你没有访问该工作区的权限。", undefined, "not-found");
    }
    return member;
  }

  async requireEditor(userId: string, workspaceId: string) {
    const member = await this.membership(userId, workspaceId);
    if (member.role === "viewer") {
      throw new ProblemException(403, "没有编辑权限", "当前角色为只读。", undefined, "forbidden");
    }
    return member;
  }

  async projectContext(userId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { workspace: true },
    });
    if (!project) {
      throw new ProblemException(404, "项目不存在", undefined, undefined, "not-found");
    }
    const member = await this.membership(userId, project.workspaceId);
    return { project, member };
  }

  async pipelineContext(userId: string, pipelineId: string) {
    const pipeline = await this.prisma.pipeline.findUnique({
      where: { id: pipelineId },
      include: { project: { include: { workspace: true } } },
    });
    if (!pipeline) {
      throw new ProblemException(404, "管道不存在", undefined, undefined, "not-found");
    }
    const member = await this.membership(userId, pipeline.project.workspaceId);
    return { pipeline, member };
  }

  async runContext(userId: string, runId: string) {
    const run = await this.prisma.run.findUnique({
      where: { id: runId },
      include: { pipeline: { include: { project: { include: { workspace: true } } } } },
    });
    if (!run) {
      throw new ProblemException(404, "运行不存在", undefined, undefined, "not-found");
    }
    const member = await this.membership(userId, run.pipeline.project.workspaceId);
    return { run, member };
  }
}
