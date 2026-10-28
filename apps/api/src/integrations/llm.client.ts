import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CryptoService, PrismaService } from "../platform/platform.providers";

export type LlmRequest = {
  system?: string;
  prompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
};

export type LlmResponse = {
  text: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number };
};

function mockAnswer(prompt: string): string {
  const snippet = prompt.replace(/\s+/g, " ").slice(0, 160);
  return `综合评分 8/10：线索质量较高，建议进入销售流程。\n\n（演示模型输出，输入摘要：${snippet}）`;
}

@Injectable()
export class LlmClient {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
  ) {}

  async completeForWorkspace(workspaceId: string, request: LlmRequest): Promise<LlmResponse> {
    if (this.config.get<boolean>("LLM_MOCK") === true) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      return {
        text: mockAnswer(request.prompt),
        model: request.model ?? "flowgate-mock",
        usage: { promptTokens: Math.ceil(request.prompt.length / 4), completionTokens: 48 },
      };
    }

    const connection = await this.prisma.llmConnection.findFirst({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
    });

    let baseUrl = this.config.getOrThrow<string>("LLM_BASE_URL");
    let apiKey = this.config.get<string>("LLM_API_KEY") ?? "";
    let model = request.model ?? this.config.getOrThrow<string>("LLM_MODEL");

    if (connection) {
      baseUrl = connection.baseUrl;
      model = request.model ?? connection.model;
      apiKey = this.crypto.decrypt(connection.secretCt, connection.secretIv);
    }

    if (!apiKey) {
      throw new Error("没有可用的模型 API Key：请在设置中配置模型连接，或设置 LLM_MOCK=true");
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (request.system?.trim()) messages.push({ role: "system", content: request.system });
    messages.push({ role: "user", content: request.prompt });

    const timeout = AbortSignal.timeout(60_000);
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;

    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxTokens ?? 512,
      }),
      signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`模型调用失败 (${response.status}): ${text.slice(0, 300)}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    return {
      text: payload.choices?.[0]?.message?.content ?? "",
      model,
      usage: {
        promptTokens: payload.usage?.prompt_tokens ?? 0,
        completionTokens: payload.usage?.completion_tokens ?? 0,
      },
    };
  }
}
