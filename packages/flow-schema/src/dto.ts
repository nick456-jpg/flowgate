import { z } from "zod";
import { pipelineGraphSchema } from "./graph";

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const registerSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(40),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(40),
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(40),
});

export const createPipelineSchema = z.object({
  name: z.string().trim().min(1).max(40),
});

export const updatePipelineSchema = z.object({
  name: z.string().trim().min(1).max(40),
});

export const updateDraftSchema = z.object({
  graph: pipelineGraphSchema,
  note: z.string().trim().max(200).optional(),
});

export const createRevisionSchema = z.object({
  note: z.string().trim().max(200).optional(),
});

export const createRunSchema = z.object({
  revisionId: z.string().uuid().optional(),
  inputs: z.record(z.unknown()).default({}),
});

export const forkRunSchema = z.object({
  fromStep: z.string().min(1).max(32),
});

export const llmConnectionSchema = z.object({
  provider: z.string().trim().min(1).max(40),
  baseUrl: z.string().url().max(500),
  model: z.string().trim().min(1).max(120),
  apiKey: z.string().min(1).max(500),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type CreatePipelineInput = z.infer<typeof createPipelineSchema>;
export type UpdateDraftInput = z.infer<typeof updateDraftSchema>;
export type CreateRevisionInput = z.infer<typeof createRevisionSchema>;
export type CreateRunInput = z.infer<typeof createRunSchema>;
export type ForkRunInput = z.infer<typeof forkRunSchema>;
export type LlmConnectionInput = z.infer<typeof llmConnectionSchema>;
