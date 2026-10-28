import { useEffect, useRef } from "react";
import type { JournalEvent } from "@flowgate/schema";
import { ApiError, getAccessToken, refreshSession } from "./api";

type StreamOptions = {
  runId: string;
  cursor: number;
  signal: AbortSignal;
  onEvent: (event: JournalEvent) => void;
};

async function connect(options: StreamOptions, allowRefresh = true): Promise<void> {
  const token = getAccessToken();
  const response = await fetch(`/v1/runs/${options.runId}/events?cursor=${options.cursor}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    credentials: "include",
    signal: options.signal,
  });

  if (response.status === 401 && allowRefresh) {
    const user = await refreshSession();
    if (user) return connect(options, false);
    throw new ApiError(401, { type: "about:blank", title: "未认证", status: 401 });
  }

  if (!response.ok || !response.body) {
    throw new ApiError(response.status, {
      type: "about:blank",
      title: `事件流连接失败 (${response.status})`,
      status: response.status,
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (!options.signal.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, "\n");

    let index = buffer.indexOf("\n\n");
    while (index >= 0) {
      const chunk = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      let data = "";
      for (const line of chunk.split("\n")) {
        if (line.startsWith("data:")) data += line.slice(5).trimStart();
      }
      if (data) {
        try {
          const event = JSON.parse(data) as JournalEvent;
          if (event && typeof event.seq === "number" && typeof event.type === "string") {
            options.onEvent(event);
          }
        } catch {
          // Ignore malformed SSE frames (including stream.error notices).
        }
      }
      index = buffer.indexOf("\n\n");
    }
  }
}

export function streamRunEvents(options: StreamOptions): Promise<void> {
  return connect(options);
}

export function useRunStream(
  runId: string | null,
  cursor: number,
  enabled: boolean,
  onEvent: (event: JournalEvent) => void,
): void {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!runId || !enabled) return;
    const controller = new AbortController();
    void streamRunEvents({
      runId,
      cursor,
      signal: controller.signal,
      onEvent: (event) => handler.current(event),
    }).catch(() => undefined);
    return () => controller.abort();
  }, [runId, cursor, enabled]);
}
