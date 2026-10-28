import type { ProblemDetails } from "@flowgate/schema";
import type { SessionUser } from "./types";

export type { SessionUser };

let accessToken: string | null = null;
let refreshInFlight: Promise<SessionUser | null> | null = null;
let bootstrapPromise: Promise<SessionUser | null> | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ProblemDetails,
  ) {
    super(problem.detail || problem.title || `HTTP ${status}`);
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  retry?: boolean;
};

async function parseProblem(response: Response): Promise<ProblemDetails> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("problem+json")) {
    try {
      return (await response.json()) as ProblemDetails;
    } catch {
      // fall through
    }
  }
  const text = await response.text().catch(() => "");
  return {
    type: "about:blank",
    title: `HTTP ${response.status}`,
    status: response.status,
    detail: text.slice(0, 400) || undefined,
  };
}

async function rawFetch(path: string, options: RequestOptions): Promise<Response> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  return fetch(path, {
    method: options.method ?? "GET",
    headers,
    credentials: "include",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

export function refreshSession(): Promise<SessionUser | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const response = await fetch("/v1/auth/refresh", { method: "POST", credentials: "include" });
      if (!response.ok) {
        accessToken = null;
        return null;
      }
      const data = (await response.json()) as { user: SessionUser; accessToken: string };
      accessToken = data.accessToken;
      return data.user;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export function bootstrapSession(): Promise<SessionUser | null> {
  if (!bootstrapPromise) bootstrapPromise = refreshSession();
  return bootstrapPromise;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await rawFetch(path, options);

  if (response.status === 401 && options.retry !== false) {
    const user = await refreshSession();
    if (user) response = await rawFetch(path, options);
  }

  if (!response.ok) {
    const problem = await parseProblem(response);
    if (response.status === 401) accessToken = null;
    throw new ApiError(response.status, problem);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function loginRequest(email: string, password: string) {
  const result = await api<{ user: SessionUser; accessToken: string }>("/v1/auth/login", {
    method: "POST",
    body: { email, password },
    retry: false,
  });
  accessToken = result.accessToken;
  return result;
}

export async function registerRequest(email: string, password: string, displayName: string) {
  const result = await api<{ user: SessionUser; accessToken: string }>("/v1/auth/register", {
    method: "POST",
    body: { email, password, displayName },
    retry: false,
  });
  accessToken = result.accessToken;
  return result;
}

export async function logoutRequest(): Promise<void> {
  await fetch("/v1/auth/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
  accessToken = null;
  bootstrapPromise = Promise.resolve(null);
}

export function problemMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.problem.detail || error.problem.title || error.message;
  }
  return error instanceof Error ? error.message : "请求失败";
}

export function problemFields(error: unknown): Array<{ pointer: string; message: string }> {
  if (error instanceof ApiError) return error.problem.errors ?? [];
  return [];
}
