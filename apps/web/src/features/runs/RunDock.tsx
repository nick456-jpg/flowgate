import { useEffect, useMemo, useState } from "react";
import { Button, Slider, Tag, message } from "antd";
import {
  CloseOutlined,
  ForkOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  indexGraph,
  topologicalOrder,
  type JournalEvent,
  type PipelineGraph,
} from "@flowgate/schema";
import { api, problemMessage } from "../../lib/api";
import type { RevisionDetail, RunDetail } from "../../lib/types";
import { formatDuration, shortId, timeOfDay } from "../../lib/format";
import { StatusTag } from "../../components/StatusTag";
import { useRunView } from "../../stores/runView";
import { useRunStream } from "../../lib/sse";

type RunDockProps = {
  runId: string;
  fallbackGraph: PipelineGraph;
  onClose: () => void;
  onFork: (childRunId: string) => void;
};

export function RunDock({ runId, fallbackGraph, onClose, onFork }: RunDockProps) {
  const queryClient = useQueryClient();
  const [cursor, setCursor] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const runQuery = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api<RunDetail>(`/v1/runs/${runId}`),
    refetchInterval: (query) => {
      const data = query.state.data as RunDetail | undefined;
      if (!data) return 2000;
      return data.status === "succeeded" || data.status === "failed" || data.status === "cancelled"
        ? false
        : 2000;
    },
  });
  const run = runQuery.data;

  const revisionQuery = useQuery({
    queryKey: ["revision", run?.pipeline.id, run?.revision.number],
    queryFn: () =>
      api<RevisionDetail>(`/v1/pipelines/${run!.pipeline.id}/revisions/${run!.revision.number}`),
    enabled: !!run,
  });

  const eventsQuery = useQuery({
    queryKey: ["run-events", runId],
    queryFn: () => api<{ events: JournalEvent[]; lastSeq: number }>(`/v1/runs/${runId}/events?format=json`),
  });

  const setRun = useRunView((state) => state.setRun);
  const setHistory = useRunView((state) => state.setHistory);
  const addEvent = useRunView((state) => state.addEvent);
  const events = useRunView((state) => state.events);
  const folded = useRunView((state) => state.folded);
  const uptoSeq = useRunView((state) => state.uptoSeq);
  const setUptoSeq = useRunView((state) => state.setUptoSeq);

  useEffect(() => {
    setRun(runId);
    setCursor(0);
    setSelectedKey(null);
  }, [runId, setRun]);

  useEffect(() => {
    if (eventsQuery.data) {
      setHistory(eventsQuery.data.events);
      setCursor(eventsQuery.data.lastSeq);
    }
  }, [eventsQuery.data, setHistory]);

  const live = !folded.terminal && (run?.status === "queued" || run?.status === "running");
  useRunStream(runId, cursor, !!live, (event) => addEvent(event));

  const graph = revisionQuery.data?.graph ?? fallbackGraph;
  const order = useMemo(() => {
    try {
      return topologicalOrder(graph);
    } catch {
      return [];
    }
  }, [graph]);
  const index = useMemo(() => indexGraph(graph), [graph]);

  const maxSeq = events.length > 0 ? events[events.length - 1].seq : 0;
  const replaying = uptoSeq !== null;
  const shownStatus = replaying ? (folded.status ?? "pending") : (folded.status ?? run?.status ?? "queued");
  const selectedStep = selectedKey ? folded.steps[selectedKey] : undefined;
  const selectedNode = selectedKey ? index.byKey.get(selectedKey) : undefined;
  const visibleEvents = replaying ? events.filter((event) => event.seq <= (uptoSeq ?? 0)) : events;

  const cancelMutation = useMutation({
    mutationFn: () => api(`/v1/runs/${runId}/cancel`, { method: "POST" }),
    onSuccess: () => {
      message.success("已请求取消");
      queryClient.invalidateQueries({ queryKey: ["run", runId] });
    },
    onError: (error) => message.error(problemMessage(error)),
  });

  const resumeMutation = useMutation({
    mutationFn: () => api(`/v1/runs/${runId}/resume`, { method: "POST" }),
    onSuccess: async () => {
      message.success("已重新排队");
      setUptoSeq(null);
      await eventsQuery.refetch();
      queryClient.invalidateQueries({ queryKey: ["run", runId] });
    },
    onError: (error) => message.error(problemMessage(error)),
  });

  const forkMutation = useMutation({
    mutationFn: () =>
      api<{ run: { id: string } }>(`/v1/runs/${runId}/fork`, {
        method: "POST",
        body: { fromStep: selectedKey },
      }),
    onSuccess: (result) => {
      message.success("已创建分叉运行");
      onFork(result.run.id);
    },
    onError: (error) => message.error(problemMessage(error)),
  });

  if (runQuery.isError) {
    return (
      <div className="run-dock">
        <div className="run-dock__head">
          <span>无法读取运行</span>
          <div className="spacer" />
          <Button size="small" type="text" icon={<CloseOutlined />} onClick={onClose} />
        </div>
        <div style={{ padding: 16, color: "#f87171", fontSize: 11 }}>{problemMessage(runQuery.error)}</div>
      </div>
    );
  }

  return (
    <section className="run-dock">
      <div className="run-dock__head">
        <div className="run-dock__title">
          <span style={{ fontWeight: 650 }}>运行</span>
          <span className="run-dock__id mono">#{shortId(runId)}</span>
          <StatusTag status={shownStatus} />
          {folded.cancelling && <Tag color="orange" style={{ margin: 0 }}>取消中</Tag>}
          {run && <span className="dim mono">v{run.revision.number}</span>}
          {run?.parent && (
            <span className="dim" style={{ fontSize: 10 }}>
              分叉自 #{shortId(run.parent.id)}
            </span>
          )}
          {run && <span className="dim" style={{ fontSize: 10 }}>{formatDuration(run.durationMs)}</span>}
        </div>
        <div className="run-dock__actions">
          {live && !folded.cancelling && (
            <Button
              size="small"
              icon={<PauseCircleOutlined />}
              loading={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              取消
            </Button>
          )}
          {(run?.status === "failed" || run?.status === "cancelled") && (
            <Button
              size="small"
              type="primary"
              icon={<PlayCircleOutlined />}
              loading={resumeMutation.isPending}
              onClick={() => resumeMutation.mutate()}
            >
              恢复
            </Button>
          )}
          <Button
            size="small"
            icon={<ForkOutlined />}
            disabled={!selectedStep || selectedStep.status !== "succeeded"}
            loading={forkMutation.isPending}
            onClick={() => forkMutation.mutate()}
          >
            从此分叉
          </Button>
          <Button size="small" type="text" icon={<CloseOutlined />} onClick={onClose} />
        </div>
      </div>

      <div className="replay-bar">
        <span className="mono" style={{ color: replaying ? "#fbbf24" : "#6f7888" }}>
          {replaying ? `回放 #${uptoSeq}` : "实时"}
        </span>
        <Slider
          className="replay-slider"
          min={0}
          max={Math.max(maxSeq, 1)}
          value={replaying ? (uptoSeq ?? 0) : maxSeq}
          disabled={maxSeq === 0}
          tooltip={{ formatter: (value) => `seq ${value}` }}
          onChange={(value) => setUptoSeq(value >= maxSeq ? null : value)}
        />
        <span className="mono">{maxSeq} events</span>
        {replaying && (
          <Button size="small" type="text" icon={<ReloadOutlined />} onClick={() => setUptoSeq(null)}>
            回到实时
          </Button>
        )}
      </div>

      <div className="run-tape">
        {order.map((key) => {
          const node = index.byKey.get(key);
          if (!node) return null;
          const step = folded.steps[key];
          const status = step?.status ?? "pending";
          return (
            <button
              type="button"
              key={key}
              className={`run-chip${selectedKey === key ? " selected" : ""}${status === "skipped" ? " run-chip--skipped" : ""}`}
              onClick={() => setSelectedKey(key)}
            >
              <div className="run-chip__top">
                <span className={`status-dot status-dot--${status}`} />
                <span>{node.title}</span>
              </div>
              <div className="run-chip__meta">
                <span>{key}</span>
                <span style={{ marginLeft: "auto" }}>{formatDuration(step?.durationMs ?? null)}</span>
              </div>
            </button>
          );
        })}
        {order.length === 0 && <span className="dim" style={{ fontSize: 10 }}>正在读取修订图…</span>}
      </div>

      <div className="run-dock__body">
        <div className="run-dock__detail">
          {selectedNode ? (
            <>
              <h4>
                {selectedNode.title} · {selectedNode.key} · {selectedStep?.status ?? "pending"}
              </h4>
              <pre className="json">
                {JSON.stringify(
                  selectedStep?.error ?? selectedStep?.output ?? { info: "这个步骤还没有执行" },
                  null,
                  2,
                )}
              </pre>
            </>
          ) : (
            <>
              <h4>运行输出</h4>
              <pre className="json">{JSON.stringify(folded.output ?? { info: "选择步骤查看输出；运行完成后这里显示最终输出" }, null, 2)}</pre>
            </>
          )}
        </div>
        <div className="run-dock__events">
          <h4>事件流 {replaying ? `(至 #${uptoSeq})` : ""}</h4>
          {visibleEvents.map((event) => (
            <div className="event-row" key={event.seq}>
              <span className="event-row__seq">{event.seq}</span>
              <span className="event-row__type">{event.type}</span>
              <span className="event-row__time">{timeOfDay(event.at)}</span>
            </div>
          ))}
          {visibleEvents.length === 0 && <div className="dim" style={{ fontSize: 10 }}>还没有事件。</div>}
        </div>
      </div>
    </section>
  );
}
