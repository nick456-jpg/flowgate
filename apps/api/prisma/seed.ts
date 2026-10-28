import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { PrismaClient, Prisma } from "@prisma/client";
import { Algorithm, hash } from "@node-rs/argon2";
import {
  canonicalJson,
  createEvent,
  pipelineGraphSchema,
  type JournalEvent,
  type PipelineGraph,
} from "@flowgate/schema";

try {
  process.loadEnvFile(resolve(process.cwd(), "../../.env"));
} catch {
  // Environment can also be provided by the shell or Docker compose.
}

const prisma = new PrismaClient();

const DEMO_EMAIL = "demo@flowgate.dev";
const DEMO_PASSWORD = "flowgate-demo";
const RUN_ID = "11111111-1111-4111-8111-111111111111";

const demoGraph: PipelineGraph = pipelineGraphSchema.parse({
  schemaVersion: 1,
  nodes: [
    {
      id: "n_start",
      key: "start",
      kind: "start",
      title: "起点",
      position: { x: 40, y: 260 },
      config: {},
      maxAttempts: 1,
    },
    {
      id: "n_prompt",
      key: "prompt_1",
      kind: "prompt",
      title: "线索评估",
      position: { x: 240, y: 260 },
      config: {
        system: "你是一名严谨的 B2B 销售助理，只输出结论和理由。",
        template:
          "请评估这条线索：公司 {{inputs.company}}，预算 {{inputs.budget}} 元。给出 1-10 分，并说明是否建议进入销售流程。",
        temperature: 0.2,
        maxTokens: 300,
      },
      maxAttempts: 1,
    },
    {
      id: "n_branch",
      key: "branch_1",
      kind: "branch",
      title: "预算判断",
      position: { x: 440, y: 260 },
      config: { expression: "inputs.budget >= 30000" },
      maxAttempts: 1,
    },
    {
      id: "n_fetch",
      key: "fetch_1",
      kind: "fetch",
      title: "同步 CRM",
      position: { x: 640, y: 140 },
      config: {
        method: "POST",
        url: "https://api.example.test/crm/leads",
        headers: { "Content-Type": "application/json" },
        body: "{\"company\":\"{{inputs.company}}\"}",
        timeoutMs: 10000,
      },
      maxAttempts: 2,
    },
    {
      id: "n_respond_hot",
      key: "respond_hot",
      kind: "respond",
      title: "高价值响应",
      position: { x: 840, y: 140 },
      config: {
        expression:
          '{"route":"sales","crm":steps.fetch_1.output.body,"summary":steps.prompt_1.output.text}',
      },
      maxAttempts: 1,
    },
    {
      id: "n_respond_cold",
      key: "respond_cold",
      kind: "respond",
      title: "普通线索",
      position: { x: 640, y: 380 },
      config: {
        expression: '{"route":"nurture","summary":steps.prompt_1.output.text}',
      },
      maxAttempts: 1,
    },
  ],
  edges: [
    { id: "e_start_prompt", source: "n_start", target: "n_prompt", sourceHandle: "out" },
    { id: "e_prompt_branch", source: "n_prompt", target: "n_branch", sourceHandle: "out" },
    { id: "e_branch_fetch", source: "n_branch", target: "n_fetch", sourceHandle: "true" },
    { id: "e_branch_cold", source: "n_branch", target: "n_respond_cold", sourceHandle: "false" },
    { id: "e_fetch_hot", source: "n_fetch", target: "n_respond_hot", sourceHandle: "out" },
  ],
});

const demoInputs = { company: "星海制造", budget: 50000 };
const demoPromptText = "综合评分 8/10：制造行业客户，预算充足，建议进入销售流程。";
const demoCrmBody = { leadId: "crm_1001", accepted: true };

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function at(offsetSeconds: number): string {
  return new Date(Date.now() - 90_000 + offsetSeconds * 1000).toISOString();
}

function journal(): JournalEvent[] {
  return [
    createEvent(RUN_ID, 1, "run.queued", { revisionId: "seed", trigger: "manual" }, at(0)),
    createEvent(RUN_ID, 2, "run.started", { workerId: "seed" }, at(1)),
    createEvent(RUN_ID, 3, "step.entered", { nodeKey: "start", attempt: 1 }, at(2)),
    createEvent(
      RUN_ID,
      4,
      "step.succeeded",
      { nodeKey: "start", attempt: 1, output: demoInputs, durationMs: 4 },
      at(3),
    ),
    createEvent(RUN_ID, 5, "step.entered", { nodeKey: "prompt_1", attempt: 1 }, at(4)),
    createEvent(
      RUN_ID,
      6,
      "step.succeeded",
      {
        nodeKey: "prompt_1",
        attempt: 1,
        output: { text: demoPromptText, usage: { promptTokens: 128, completionTokens: 42 } },
        durationMs: 860,
      },
      at(5),
    ),
    createEvent(RUN_ID, 7, "step.entered", { nodeKey: "branch_1", attempt: 1 }, at(6)),
    createEvent(
      RUN_ID,
      8,
      "step.succeeded",
      { nodeKey: "branch_1", attempt: 1, output: { result: true }, durationMs: 3 },
      at(7),
    ),
    createEvent(RUN_ID, 9, "branch.selected", { nodeKey: "branch_1", branch: "true" }, at(7)),
    createEvent(RUN_ID, 10, "step.skipped", { nodeKey: "respond_cold", reason: "false 分支未被选中" }, at(8)),
    createEvent(RUN_ID, 11, "step.entered", { nodeKey: "fetch_1", attempt: 1 }, at(9)),
    createEvent(
      RUN_ID,
      12,
      "step.succeeded",
      {
        nodeKey: "fetch_1",
        attempt: 1,
        output: { status: 200, headers: { "content-type": "application/json" }, body: demoCrmBody },
        durationMs: 120,
      },
      at(10),
    ),
    createEvent(RUN_ID, 13, "step.entered", { nodeKey: "respond_hot", attempt: 1 }, at(11)),
    createEvent(
      RUN_ID,
      14,
      "step.succeeded",
      {
        nodeKey: "respond_hot",
        attempt: 1,
        output: { response: { route: "sales", crm: demoCrmBody, summary: demoPromptText } },
        durationMs: 5,
      },
      at(12),
    ),
    createEvent(
      RUN_ID,
      15,
      "run.succeeded",
      { output: { route: "sales", crm: demoCrmBody, summary: demoPromptText } },
      at(13),
    ),
  ];
}

async function seedSampleRun(runId: string): Promise<void> {
  const events = journal().map((event) => ({
    runId,
    seq: event.seq,
    type: event.type,
    payload: event.payload as unknown as Prisma.InputJsonValue,
    schemaVersion: 1,
    createdAt: new Date(event.at),
  }));
  await prisma.runEvent.createMany({ data: events, skipDuplicates: true });

  const stepRows = [
    {
      nodeKey: "start",
      status: "succeeded" as const,
      attempt: 1,
      output: demoInputs,
      startedAt: at(2),
      finishedAt: at(3),
      durationMs: 4,
    },
    {
      nodeKey: "prompt_1",
      status: "succeeded" as const,
      attempt: 1,
      output: { text: demoPromptText, usage: { promptTokens: 128, completionTokens: 42 } },
      startedAt: at(4),
      finishedAt: at(5),
      durationMs: 860,
    },
    {
      nodeKey: "branch_1",
      status: "succeeded" as const,
      attempt: 1,
      output: { result: true },
      startedAt: at(6),
      finishedAt: at(7),
      durationMs: 3,
    },
    {
      nodeKey: "respond_cold",
      status: "skipped" as const,
      attempt: 0,
      output: {},
      startedAt: at(7),
      finishedAt: at(8),
      durationMs: null,
    },
    {
      nodeKey: "fetch_1",
      status: "succeeded" as const,
      attempt: 1,
      output: { status: 200, headers: { "content-type": "application/json" }, body: demoCrmBody },
      startedAt: at(9),
      finishedAt: at(10),
      durationMs: 120,
    },
    {
      nodeKey: "respond_hot",
      status: "succeeded" as const,
      attempt: 1,
      output: { response: { route: "sales", crm: demoCrmBody, summary: demoPromptText } },
      startedAt: at(11),
      finishedAt: at(12),
      durationMs: 5,
    },
  ];

  for (const row of stepRows) {
    await prisma.runStep.upsert({
      where: { runId_nodeKey: { runId, nodeKey: row.nodeKey } },
      update: {
        status: row.status,
        attempt: row.attempt,
        output: row.output as unknown as Prisma.InputJsonValue,
        startedAt: row.startedAt ? new Date(row.startedAt) : null,
        finishedAt: row.finishedAt ? new Date(row.finishedAt) : null,
        durationMs: row.durationMs,
      },
      create: {
        runId,
        nodeKey: row.nodeKey,
        status: row.status,
        attempt: row.attempt,
        output: row.output as unknown as Prisma.InputJsonValue,
        startedAt: row.startedAt ? new Date(row.startedAt) : null,
        finishedAt: row.finishedAt ? new Date(row.finishedAt) : null,
        durationMs: row.durationMs,
      },
    });
  }
}

async function main() {
  const passwordHash = await hash(DEMO_PASSWORD, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { displayName: "演示用户", passwordHash },
    create: { email: DEMO_EMAIL, displayName: "演示用户", passwordHash },
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: "flowgate-demo" },
    update: { name: "FlowGate 演示" },
    create: { name: "FlowGate 演示", slug: "flowgate-demo", createdBy: user.id },
  });

  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    update: { role: "owner" },
    create: { workspaceId: workspace.id, userId: user.id, role: "owner" },
  });

  const project = await prisma.project.upsert({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: "demo-project" } },
    update: { name: "示例项目" },
    create: { workspaceId: workspace.id, name: "示例项目", slug: "demo-project" },
  });

  const pipeline = await prisma.pipeline.upsert({
    where: { projectId_slug: { projectId: project.id, slug: "lead-qualifier" } },
    update: { name: "线索分级管道" },
    create: { projectId: project.id, name: "线索分级管道", slug: "lead-qualifier" },
  });

  const existingDraft = await prisma.pipelineDraft.findUnique({ where: { pipelineId: pipeline.id } });
  if (!existingDraft) {
    await prisma.pipelineDraft.create({
      data: {
        pipelineId: pipeline.id,
        graph: demoGraph as unknown as Prisma.InputJsonValue,
        schemaVersion: 1,
        rowVersion: 1,
      },
    });
  }

  const graphHash = sha256(canonicalJson(demoGraph));
  let revision = await prisma.revision.findUnique({
    where: { pipelineId_number: { pipelineId: pipeline.id, number: 1 } },
  });
  if (!revision) {
    revision = await prisma.revision.create({
      data: {
        pipelineId: pipeline.id,
        number: 1,
        graph: demoGraph as unknown as Prisma.InputJsonValue,
        graphHash,
        kind: "manual",
        note: "演示基线",
        createdBy: user.id,
      },
    });
  }

  if (!pipeline.headRevisionId) {
    await prisma.pipeline.update({
      where: { id: pipeline.id },
      data: { headRevisionId: revision.id },
    });
  }

  const existingRun = await prisma.run.findUnique({
    where: { pipelineId_idempotencyKey: { pipelineId: pipeline.id, idempotencyKey: "seed-demo-run" } },
  });

  let runId = existingRun?.id;
  if (!existingRun) {
    const run = await prisma.run.create({
      data: {
        id: RUN_ID,
        pipelineId: pipeline.id,
        revisionId: revision.id,
        status: "succeeded",
        trigger: "manual",
        inputs: demoInputs as unknown as Prisma.InputJsonValue,
        output: {
          route: "sales",
          crm: demoCrmBody,
          summary: demoPromptText,
        } as unknown as Prisma.InputJsonValue,
        idempotencyKey: "seed-demo-run",
        requestHash: sha256(canonicalJson({ revisionId: revision.id, inputs: demoInputs })),
        createdBy: user.id,
        eventSeq: 15,
        startedAt: new Date(at(1)),
        finishedAt: new Date(at(13)),
      },
    });
    await seedSampleRun(run.id);
    runId = run.id;
  }

  console.log("Seed complete");
  console.log(`  user:     ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  pipeline: ${pipeline.id}`);
  console.log(`  run:      ${runId}`);
  console.log("  note:     existing drafts, revisions and runs are left untouched");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
