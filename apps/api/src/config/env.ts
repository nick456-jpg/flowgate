import { z } from "zod";

const booleanish = z.preprocess((value) => {
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return value;
}, z.boolean());

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, "ENCRYPTION_KEY must be 64 hex characters"),
  WEB_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  COOKIE_SECURE: booleanish.default(false),
  LLM_MOCK: booleanish.default(true),
  LLM_BASE_URL: z.string().default("https://dashscope.aliyuncs.com/compatible-mode/v1"),
  LLM_API_KEY: z.string().default(""),
  LLM_MODEL: z.string().default("qwen-plus"),
  RUNTIME_ROLE: z.enum(["http", "worker"]).default("http"),
  RUN_CONCURRENCY: z.coerce.number().int().positive().default(2),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  return envSchema.parse(raw);
}
