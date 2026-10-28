import { Injectable } from "@nestjs/common";
import jsonata from "jsonata";
import { parseNodeConfig, type PipelineNode } from "@flowgate/schema";
import { HttpClient } from "../integrations/http.client";
import { LlmClient } from "../integrations/llm.client";

export type RunContext = {
  workspaceId: string;
  inputs: Record<string, unknown>;
  steps: Record<string, { output: unknown }>;
};

export type StepResult = {
  output: unknown;
  branch?: "true" | "false";
  usage?: { model: string; promptTokens: number; completionTokens: number };
};

const TEMPLATE_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

function readPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, part) => {
    if (current === null || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[part];
  }, source);
}

export function resolveTemplate(template: string, context: RunContext): string {
  return template.replace(TEMPLATE_PATTERN, (_match, path: string) => {
    const value = readPath({ steps: context.steps, inputs: context.inputs }, path);
    if (value === undefined) {
      throw new Error(`模板变量不存在: ${path}`);
    }
    return typeof value === "string" ? value : JSON.stringify(value);
  });
}

async function evaluate(expression: string, context: RunContext): Promise<unknown> {
  const compiled = jsonata(expression);
  return compiled.evaluate({ steps: context.steps, inputs: context.inputs });
}

@Injectable()
export class StepRunner {
  constructor(
    private readonly llm: LlmClient,
    private readonly http: HttpClient,
  ) {}

  async run(node: PipelineNode, context: RunContext, signal: AbortSignal): Promise<StepResult> {
    switch (node.kind) {
      case "start":
        return { output: { ...context.inputs } };

      case "prompt": {
        const config = parseNodeConfig("prompt", node.config);
        const prompt = resolveTemplate(config.template, context);
        const system = config.system ? resolveTemplate(config.system, context) : "";
        const response = await this.llm.completeForWorkspace(context.workspaceId, {
          system,
          prompt,
          model: config.model,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          signal,
        });
        return {
          output: { text: response.text, usage: response.usage },
          usage: { model: response.model, ...response.usage },
        };
      }

      case "transform": {
        const config = parseNodeConfig("transform", node.config);
        const value = await evaluate(config.expression, context);
        return { output: { value } };
      }

      case "branch": {
        const config = parseNodeConfig("branch", node.config);
        const value = await evaluate(config.expression, context);
        if (typeof value !== "boolean") {
          throw new Error("分支表达式必须返回布尔值");
        }
        return { output: { result: value }, branch: value ? "true" : "false" };
      }

      case "fetch": {
        const config = parseNodeConfig("fetch", node.config);
        const url = resolveTemplate(config.url, context);
        const headers = Object.fromEntries(
          Object.entries(config.headers).map(([key, value]) => [key, resolveTemplate(value, context)]),
        );
        const body = config.body ? resolveTemplate(config.body, context) : undefined;
        const response = await this.http.request({
          method: config.method,
          url,
          headers,
          body,
          timeoutMs: config.timeoutMs,
          signal,
        });
        return { output: response };
      }

      case "respond": {
        const config = parseNodeConfig("respond", node.config);
        const value = await evaluate(config.expression, context);
        return { output: { response: value } };
      }

      default:
        throw new Error(`未知节点类型: ${String((node as PipelineNode).kind)}`);
    }
  }
}
