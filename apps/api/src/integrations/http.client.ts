import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { assertPublicHttpUrl } from "./url-policy";

export type HttpRequestOptions = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type HttpResponse = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
};

const MAX_BODY_BYTES = 1_000_000;

@Injectable()
export class HttpClient {
  constructor(private readonly config: ConfigService) {}

  private isMock(): boolean {
    return this.config.get<boolean>("LLM_MOCK") === true;
  }

  private mockResponse(options: HttpRequestOptions): HttpResponse {
    let echo: unknown = options.body ?? null;
    if (options.body) {
      try {
        echo = JSON.parse(options.body);
      } catch {
        echo = options.body;
      }
    }
    return {
      status: 200,
      headers: { "content-type": "application/json" },
      body: { leadId: "crm_1001", accepted: true, echo, mock: true },
    };
  }

  async request(options: HttpRequestOptions): Promise<HttpResponse> {
    const initial = new URL(options.url);
    if (this.isMock() && (initial.hostname === "api.example.test" || initial.hostname.endsWith(".test"))) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      return this.mockResponse(options);
    }

    let current = await assertPublicHttpUrl(options.url);
    let redirects = 0;

    while (true) {
      const timeoutController = new AbortController();
      const timeout = setTimeout(
        () => timeoutController.abort(new Error("HTTP 请求超时")),
        options.timeoutMs ?? 10_000,
      );
      const signal = options.signal
        ? AbortSignal.any([options.signal, timeoutController.signal])
        : timeoutController.signal;

      let response: Response;
      try {
        response = await fetch(current, {
          method: options.method,
          headers: options.headers,
          body: options.method === "GET" || options.method === "HEAD" ? undefined : options.body,
          signal,
          redirect: "manual",
        });
      } finally {
        clearTimeout(timeout);
      }

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        redirects += 1;
        if (redirects > 3) throw new Error("重定向次数过多");
        const location = response.headers.get("location");
        if (!location) throw new Error("重定向响应缺少 Location");
        current = await assertPublicHttpUrl(new URL(location, current).toString());
        continue;
      }

      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
        throw new Error("响应体超过 1MB 限制");
      }

      const contentType = response.headers.get("content-type") ?? "";
      let body: unknown = text;
      if (contentType.includes("application/json") || /^[\s]*[\[{]/.test(text)) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        (error as Error & { status?: number; body?: unknown }).status = response.status;
        (error as Error & { status?: number; body?: unknown }).body = body;
        throw error;
      }

      return { status: response.status, headers, body };
    }
  }
}
