import { useMemo, useState } from "react";
import { Button, Slider, Tag, message } from "antd";
import { ArrowLeftOutlined, PauseCircleOutlined, PlayCircleOutlined, ReloadOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { foldRun, indexGraph, topologicalOrder, type JournalEvent } from "@flowgate/schema";
import { api, problemMessage } from "../lib/api";
import type { RevisionDetail, RunDetail } from "../lib/types";
import { formatDuration, formatTime, shortId, timeOfDay } from "../lib/format";
import { Brand } from "../components/Brand";
import { Splash } from "../components/Splash";
import { StatusTag } from "../components/StatusTag";

export function RunPage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [uptoSeq, setUptoSeq] = useState<number | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const runQuery = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api<RunDetail>(`/v1/runs/${runId}`),
    enabled: !!runId,
    refetchInterval: (query) => {
      const data = query.state.data as RunDetail | undefined;
      return data && (data.status === "queued" || data.status === "running") ? 1500 : false;
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
    queryKey: ["run-events-json", runId],
    queryFn: () => api<{ events: JournalEvent[]; lastSeq: number }>(`/v1/runs/${runId}/events?format=json`),
    enabled: !!runId,
    refetchInterval: run && (run.status === "queued" || run.status === "running") ? 1500 : false,
  });

  const events = eventsQuery.data?.events ?? [];
  const folded = useMemo(() => foldRun(events, uptoSeq ?? Number.POSITIVE_INFINITY), [events, uptoSeq]);
  const graph = revisionQuery.data?.graph;

  const order = useMemo(() => {
    if (!graph) return [];
    try {
      return topologicalOrder(graph);
    } catch {
      return [];
    }
  }, [graph]);
  const index = useMemo(() => (graph ? indexGraph(graph) : null), [graph]);

  const maxSeq = events.length > 0 ? events[events.length - 1].seq : 0;
  const replaying = uptoSeq !== null;
  const shownStatus = replaying ? (folded.status ?? "pending") : (folded.status ?? run?.status ?? "queued");
  const selectedStep = selectedKey ? folded.steps[selectedKey] : undefined;
  const selectedNode = selectedKey && index ? index.byKey.get(selectedKey) : undefined;
  const visibleEvents = replaying ? events.filter((event) => event.seq <= (uptoSeq ?? 0)) : events;
  const duration =
    run?.startedAt && run?.finishedAt
      ? new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()
      : run?.durationMs;

  const cancelMutation = useMutation({
    mutationFn: () => api(`/v1/runs/${runId}/cancel`, { method: "POST" }),
    onSuccess: async () => {
      message.success("已请求取消");
      await runQuery.refetch();
    },
    onError: (error) => message.error(problemMessage(error)),
  });

  const resumeMutation = useMutation({
    mutationFn: () => api(`/v1/runs/${runId}/resume`, { method: "POST" }),
    onSuccess: async () => {
      message.success("已重新排队");
      setUptoSeq(null);
      await Promise.all([runQuery.refetch(), eventsQuery.refetch()]);
      queryClient.invalidateQueries({ queryKey: ["runs", "project"] });
    },
    onError: (error) => message.error(problemMessage(error)),
  });

  if (runQuery.isLoading) return <Splash label="正在读取运行" />;
  if (runQuery.isError || !run) {
    return (
      <div className="run-page">
        <div className="run-page__topbar">
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate("/")} />
          <Brand />
        </div>
        <div className="run-page__content">
          <div className="empty-state">
            <h3>无法读取这次运行</h3>
            <p>{problemMessage(runQuery.error)}</p>
            <Button onClick={() => navigate("/")}>返回工作区</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="run-page">
      <header className="run-page__topbar">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(`/pipelines/${run.pipeline.id}`)}
        />
        <Brand />
        <span className="dim" style={{ fontSize: 12 }}>{run.pipeline.name}</span>
        <StatusTag status={shownStatus} />
        {folded.cancelling && <Tag color="orange" style={{ margin: 0 }}>取消中</Tag>}
        <span className="mono dim" style={{ fontSize: 10 }}>#{shortId(run.id)}</span>
        <div className="spacer" />
        {run.parent && (
          <Button size="small" type="text" onClick={() => navigate(`/runs/${run.parent!.id}`)}>
            分叉自 #{shortId(run.parent.id)}
          </Button>
        )}
        <Button
          size="small"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(`/pipelines/${run.pipeline.id}`)}
        >
          在编辑器中打开
        </Button>
      </header>

      <main className="run-page__content">
        <div className="stat-row">
          <div className="stat">
            <div className="stat__label">Status</div>
            <div className="stat__value" style={{ fontSize: 18 }}><StatusTag status={shownStatus} /></div>
          </div>
          <div className="stat">
            <div className="stat__label">Revision</div>
            <div className="stat__value">v{run.revision.number}</div>
          </div>
          <div className="stat">
            <div className="stat__label">Duration</div>
            <div className="stat__value">{formatDuration(duration ?? null)}</div>
          </div>
          <div className="stat">
            <div className="stat__label">Events</div>
            <div className="stat__value">{maxSeq}</div>
          </div>
        </div>

        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="replay-bar" style={{ borderBottom: "none", padding: "0 0 6px" }}>
            <span className="mono" style={{ color: replaying ? "#fbbf24" : "#6f7888" }}>
              {replaying ? `回放 #${uptoSeq}` : "实时"}
            </span>
            <Slider
              className="replay-slider"
              min={0}
              max={Math.max(maxSeq, 1)}
              value={replaying ? (uptoSeq ?? 0) : maxSeq}
              disabled={maxSeq === 0}
              onChange={(value) => setUptoSeq(value >= maxSeq ? null : value)}
            />
            <span className="mono dim">{maxSeq} events</span>
            {replaying && (
              <Button size="small" type="text" icon={<ReloadOutlined />} onClick={() => setUptoSeq(null)}>
                回到实时
              </Button>
            )}
            {run.status === "queued" || run.status === "running" ? (
              <Button size="small" icon={<PauseCircleOutlined />} loading={cancelMutation.isPending} onClick={() => cancelMutation.mutate()}>
                取消
              </Button>
            ) : null}
            {run.status === "failed" || run.status === "cancelled" ? (
              <Button size="small" type="primary" icon={<PlayCircleOutlined />} loading={resumeMutation.isPending} onClick={() => resumeMutation.mutate()}>
                恢复
              </Button>
            ) : null}
          </div>
          <div className="dim" style={{ fontSize: 10.5 }}>
            创建于 {formatTime(run.createdAt)}
            {run.parent && ` · 分叉自 #${shortId(run.parent.id)}`}
          </div>
        </div>

        <div className="run-layout">
          <div className="panel">
            <h3 className="panel__title">步骤</h3>
            <div className="run-steps">
              {order.map((key) => {
                const node = index?.byKey.get(key);
                if (!node) return null;
                const step = folded.steps[key];
                const status = step?.status ?? "pending";
                return (
                  <div
                    key={key}
                    className={`run-step-row${selectedKey === key ? " selected" : ""}`}
                    onClick={() => setSelectedKey(key)}
                  >
                    <span className={`status-dot status-dot--${status}`} />
                    <div>
                      <div className="run-step-row__title">{node.title}</div>
                      <div className="run-step-row__key">{key}</div>
                    </div>
                    <div className="spacer" />
                    <StatusTag status={status} />
                    <span className="run-step-row__duration">{formatDuration(step?.durationMs ?? null)}</span>
                  </div>
                );
              })}
              {order.length === 0 && <div className="dim" style={{ fontSize: 11 }}>正在读取修订图…</div>}
            </div>
          </div>

          <div className="panel">
            <h3 className="panel__title">{selectedNode ? `${selectedNode.title} 的输出` : "最终输出"}</h3>
            <pre className="json" style={{ maxHeight: 420 }}>
              {JSON.stringify(
                selectedStep?.error ??
                  selectedStep?.output ??
                  (selectedNode ? { info: "这个步骤还没有执行" } : folded.output ?? { info: "运行还没有输出" }),
                null,
                2,
              )}
            </pre>
          </div>
        </div>

        <div className="panel" style={{ marginTop: 14 }}>
          <h3 className="panel__title">事件时间线 {replaying ? `（至 #${uptoSeq}）` : ""}</h3>
          <div className="timeline">
            {visibleEvents.map((event) => (
              <div className="event-row" key={event.seq}>
                <span className="event-row__seq">{event.seq}</span>
                <span className="event-row__type">{event.type}</span>
                <span className="event-row__time">{timeOfDay(event.at)}</span>
              </div>
            ))}
            {visibleEvents.length === 0 && <div className="dim" style={{ fontSize: 11 }}>还没有事件。</div>}
          </div>
        </div>
      </main>
    </div>
  );
}
