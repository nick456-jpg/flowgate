import type { PipelineGraph } from "@flowgate/schema";

export type Role = "owner" | "editor" | "viewer";

export type SessionUser = { id: string; email: string; displayName: string };

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  pipelineCount?: number;
  role?: Role;
  workspace?: { id: string; name: string; slug: string };
  createdAt: string;
  updatedAt: string;
};

export type RevisionRef = {
  id: string;
  number: number;
  createdAt: string;
  graphHash?: string;
};

export type PipelineSummary = {
  id: string;
  name: string;
  slug: string;
  headRevision: RevisionRef | null;
  revisionCount: number;
  runCount: number;
  createdAt: string;
  updatedAt: string;
};

export type PipelineDetail = {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  headRevisionId: string | null;
  headRevision: RevisionRef | null;
  draft: { rowVersion: number; updatedAt: string } | null;
  project: { id: string; name: string; workspaceId: string };
  role: Role;
  revisionCount: number;
  runCount: number;
  createdAt: string;
  updatedAt: string;
};

export type Draft = {
  graph: PipelineGraph;
  schemaVersion: number;
  rowVersion: number;
  updatedAt: string;
};

export type RevisionSummary = {
  id: string;
  number: number;
  kind: string;
  note: string | null;
  graphHash: string;
  createdAt: string;
  author: string;
};

export type RevisionDetail = {
  id: string;
  pipelineId: string;
  number: number;
  graph: PipelineGraph;
  graphHash: string;
  schemaVersion: number;
  kind: string;
  note: string | null;
  createdAt: string;
};

export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type StepStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";

export type RunStep = {
  id?: string;
  nodeKey: string;
  status: StepStatus;
  attempt: number;
  durationMs: number | null;
  output?: unknown;
  error?: unknown;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export type RunSummary = {
  id: string;
  status: RunStatus;
  trigger: string;
  revisionId: string;
  parentRunId: string | null;
  pipeline: { id: string; name: string; projectId: string };
  inputs: Record<string, unknown>;
  output: unknown;
  error: unknown;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  steps: Array<Pick<RunStep, "nodeKey" | "status" | "attempt" | "durationMs">>;
};

export type RunDetail = Omit<RunSummary, "steps"> & {
  revision: { id: string; number: number; graphHash: string };
  parent: { id: string; status: RunStatus; createdAt: string } | null;
  steps: RunStep[];
};

export type LlmConnection = {
  id: string;
  provider: string;
  baseUrl: string;
  model: string;
  hasSecret: boolean;
  updatedAt: string;
};

export type Member = {
  userId: string;
  email: string;
  displayName: string;
  role: Role;
  joinedAt: string;
};

export type ListResponse<T> = { items: T[]; nextCursor?: string | null };
