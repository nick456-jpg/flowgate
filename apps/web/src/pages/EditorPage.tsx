import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, Modal, Select, Tag, message } from "antd";
import {
  ArrowLeftOutlined,
  CloudUploadOutlined,
  HistoryOutlined,
  PlayCircleOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { pipelineGraphSchema } from "@flowgate/schema";
import { api, ApiError, problemMessage } from "../lib/api";
import type {
  Draft,
  ListResponse,
  PipelineDetail,
  RevisionSummary,
  RunSummary,
} from "../lib/types";
import { formatTime, shortId } from "../lib/format";
import { graphFrom, useEditor } from "../stores/editor";
import { useRunView } from "../stores/runView";
import { Canvas } from "../features/editor/Canvas";
import { Inspector } from "../features/editor/Inspector";
import { RunDock } from "../features/runs/RunDock";
import { Brand } from "../components/Brand";
import { Splash } from "../components/Splash";
import { StatusTag } from "../components/StatusTag";

const DEFAULT_INPUTS = JSON.stringify({ company: "星海制造", budget: 50000 }, null, 2);

export function EditorPage() {
  const { pipelineId } = useParams<{ pipelineId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [runId, setRunId] = useState<string | null>(null);
  const [runModalOpen, setRunModalOpen] = useState(false);
  const [runInputs, setRunInputs] = useState(DEFAULT_INPUTS);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | undefined>(undefined);
  const [starting, setStarting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [conflict, setConflict] = useState(false);
  const loadedRef = useRef<string | null>(null);

  const pipelineQuery = useQuery({
    queryKey: ["pipeline", pipelineId],
    queryFn: () => api<PipelineDetail>(`/v1/pipelines/${pipelineId}`),
    enabled: !!pipelineId,
  });

  const draftQuery = useQuery({
    queryKey: ["draft", pipelineId],
    queryFn: () => api<Draft>(`/v1/pipelines/${pipelineId}/draft`),
    enabled: !!pipelineId,
  });

  const revisionsQuery = useQuery({
    queryKey: ["revisions", pipelineId],
    queryFn: () => api<ListResponse<RevisionSummary>>(`/v1/pipelines/${pipelineId}/revisions`),
    enabled: !!pipelineId,
  });

  const runsQuery = useQuery({
    queryKey: ["runs", "pipeline", pipelineId],
    queryFn: () => api<ListResponse<RunSummary>>(`/v1/runs?pipelineId=${pipelineId}&limit=5`),
    enabled: !!pipelineId,
  });

  const nodes = useEditor((state) => state.nodes);
  const edges = useEditor((state) => state.edges);
  const loadedPipelineId = useEditor((state) => state.pipelineId);
  const dirty = useEditor((state) => state.dirty);
  const saving = useEditor((state) => state.saving);
  const rowVersion = useEditor((state) => state.rowVersion);
  const editVersion = useEditor((state) => state.editVersion);
  const load = useEditor((state) => state.load);
  const markSaved = useEditor((state) => state.markSaved);
  const setSaving = useEditor((state) => state.setSaving);

  const graph = useMemo(() => graphFrom(nodes, edges), [nodes, edges]);
  const validation = useMemo(() => pipelineGraphSchema.safeParse(graph), [graph]);
  const editorReady = !!pipelineId && loadedPipelineId === pipelineId && nodes.length > 0;
  const validationErrors = editorReady && !validation.success
    ? validation.error.issues.slice(0, 4).map((issue) => `${issue.path.join(".") || "graph"}: ${issue.message}`)
    : [];

  useEffect(() => {
    setRunId(null);
    setConflict(false);
  }, [pipelineId]);

  useEffect(() => {
    if (!pipelineId || !draftQuery.data || !pipelineQuery.data) return;
    if (loadedRef.current === pipelineId) return;
    loadedRef.current = pipelineId;
    useRunView.getState().reset();
    load(
      pipelineId,
      draftQuery.data.graph,
      draftQuery.data.rowVersion,
      pipelineQuery.data.headRevision?.number ?? null,
    );
  }, [pipelineId, draftQuery.data, pipelineQuery.data, load]);

  const persist = useCallback(
    async (notify: boolean): Promise<boolean> => {
      const state = useEditor.getState();
      if (!pipelineId || state.pipelineId !== pipelineId || state.rowVersion === null) return false;
      if (state.saving) return false;

      const nextGraph = state.toGraph();
      const parsed = pipelineGraphSchema.safeParse(nextGraph);
      if (!parsed.success) {
        if (notify) message.error("图还有校验错误，先修正再保存");
        return false;
      }

      const snapshotEditVersion = state.editVersion;
      try {
        setSaving(true);
        const saved = await api<Draft>(`/v1/pipelines/${pipelineId}/draft`, {
          method: "PUT",
          headers: { "If-Match": String(state.rowVersion) },
          body: { graph: nextGraph },
        });
        markSaved(saved.rowVersion, snapshotEditVersion);
        setConflict(false);
        if (notify) message.success("草稿已保存");
        return true;
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          setConflict(true);
          message.warning("草稿已被其他标签页更新，请刷新页面后再继续编辑。");
        } else if (notify) {
          message.error(problemMessage(error));
        }
        return false;
      } finally {
        setSaving(false);
      }
    },
    [pipelineId, markSaved, setSaving],
  );

  useEffect(() => {
    if (!dirty || rowVersion === null || !pipelineId || conflict) return;
    const timer = setTimeout(() => {
      if (!useEditor.getState().saving) void persist(false);
    }, 900);
    return () => clearTimeout(timer);
  }, [dirty, editVersion, rowVersion, pipelineId, conflict, persist]);

  const publish = async () => {
    if (saving || publishing) return;
    const saved = await persist(false);
    if (!saved) {
      message.warning("请先修正图校验错误，或刷新解决草稿冲突。");
      return;
    }
    setPublishing(true);
    try {
      const revision = await api<RevisionSummary>(`/v1/pipelines/${pipelineId}/revisions`, {
        method: "POST",
        body: { note: "手动发布" },
      });
      message.success(`已发布修订 v${revision.number}`);
      await queryClient.invalidateQueries({ queryKey: ["pipeline", pipelineId] });
      await queryClient.invalidateQueries({ queryKey: ["revisions", pipelineId] });
    } catch (error) {
      message.error(problemMessage(error));
    } finally {
      setPublishing(false);
    }
  };

  const startRun = async () => {
    let inputs: Record<string, unknown>;
    try {
      const parsed = JSON.parse(runInputs);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not object");
      inputs = parsed as Record<string, unknown>;
    } catch {
      message.error("输入必须是合法的 JSON 对象");
      return;
    }

    setStarting(true);
    try {
      const result = await api<{ run: { id: string } }>(`/v1/pipelines/${pipelineId}/runs`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: { revisionId: selectedRevisionId, inputs },
      });
      setRunId(result.run.id);
      setRunModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["runs", "pipeline", pipelineId] });
    } catch (error) {
      message.error(problemMessage(error));
    } finally {
      setStarting(false);
    }
  };

  if (pipelineQuery.isLoading || draftQuery.isLoading) {
    return <Splash label="正在打开管道" />;
  }

  if (pipelineQuery.isError || draftQuery.isError || !pipelineQuery.data) {
    return (
      <div className="editor-page">
        <div className="editor-topbar">
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate("/")} />
          <Brand />
        </div>
        <div style={{ padding: 40 }}>
          <div className="empty-state">
            <h3>无法打开这条管道</h3>
            <p>{problemMessage(pipelineQuery.error ?? draftQuery.error)}</p>
            <Button onClick={() => navigate("/")}>返回工作区</Button>
          </div>
        </div>
      </div>
    );
  }

  const pipeline = pipelineQuery.data;
  const head = pipeline.headRevision;
  const latestRun = runsQuery.data?.items[0];
  const saveState = saving
    ? "保存中…"
    : conflict
      ? "版本冲突"
      : dirty
        ? "有未保存改动"
        : rowVersion !== null
          ? "已保存"
          : "加载中";
  const saveClass = saving ? "save-state--saving" : dirty || conflict ? "save-state--dirty" : "";

  return (
    <div className="editor-page">
      <header className="editor-topbar">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(`/projects/${pipeline.projectId}`)}
        />
        <Brand />
        <div className="editor-topbar__title">
          <span className="name">{pipeline.name}</span>
          <span className="meta">
            {pipeline.project.name}
            <span>·</span>
            {head ? <Tag color="gold" style={{ margin: 0 }}>已发布 v{head.number}</Tag> : <Tag style={{ margin: 0 }}>未发布</Tag>}
          </span>
        </div>

        <span className={`save-state ${saveClass}`}>{saveState}</span>

        <div className="spacer" />

        <Button
          icon={<HistoryOutlined />}
          disabled={!latestRun}
          onClick={() => latestRun && setRunId(latestRun.id)}
        >
          最近运行
        </Button>
        <Button
          icon={<SaveOutlined />}
          loading={saving}
          disabled={saving}
          onClick={() => void persist(true)}
        >
          保存
        </Button>
        <Button
          icon={<CloudUploadOutlined />}
          loading={publishing}
          disabled={saving || publishing}
          onClick={() => void publish()}
        >
          发布
        </Button>
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          disabled={!head}
          onClick={() => {
            setSelectedRevisionId(head?.id);
            setRunModalOpen(true);
          }}
        >
          运行
        </Button>
      </header>

      {conflict && (
        <div className="validation-banner" style={{ color: "#fbbf24", background: "rgba(251,191,36,0.06)", borderBottomColor: "rgba(251,191,36,0.25)" }}>
          草稿已被其他标签页更新。请刷新页面以重新载入最新版本。
          <Button type="link" size="small" onClick={() => window.location.reload()}>
            刷新
          </Button>
        </div>
      )}
      {validationErrors.length > 0 && (
        <div className="validation-banner">
          图校验：{validationErrors.join("；")}
        </div>
      )}

      <div className="editor-body">
        <Canvas />
        <Inspector />
      </div>

      {runId ? (
        <RunDock
          runId={runId}
          fallbackGraph={graph}
          onClose={() => setRunId(null)}
          onFork={(childId) => setRunId(childId)}
        />
      ) : (
        <div className="run-placeholder">
          <PlayCircleOutlined />
          <span>运行后在这里查看步骤状态、SSE 事件与回放</span>
          {latestRun && (
            <Button type="link" size="small" onClick={() => setRunId(latestRun.id)}>
              打开最近运行 · {shortId(latestRun.id)} · {latestRun.status}
            </Button>
          )}
        </div>
      )}

      <Modal
        title="运行管道"
        open={runModalOpen}
        onCancel={() => setRunModalOpen(false)}
        onOk={() => void startRun()}
        confirmLoading={starting}
        okText="开始运行"
        cancelText="取消"
        width={560}
      >
        <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.7, marginBottom: 14 }}>
          运行使用<strong style={{ color: "#e8ebf0" }}>已发布的修订</strong>，不会自动包含未发布的草稿改动。
          每次运行都会生成独立的事件流，之后可以回放、恢复或从某一步分叉。
        </div>

        <div className="field">
          <label>修订</label>
          <Select
            style={{ width: "100%" }}
            value={selectedRevisionId}
            placeholder={head ? `v${head.number}` : "还没有已发布修订"}
            options={(revisionsQuery.data?.items ?? []).map((revision) => ({
              value: revision.id,
              label: `v${revision.number}${revision.note ? ` · ${revision.note}` : ""}`,
            }))}
            onChange={(value) => setSelectedRevisionId(value)}
          />
        </div>

        <div className="field">
          <label>运行输入（JSON 对象）</label>
          <Input.TextArea
            className="mono"
            rows={9}
            value={runInputs}
            onChange={(event) => setRunInputs(event.target.value)}
          />
          <div className="field-help">
            示例：{"{ \"company\": \"星海制造\", \"budget\": 50000 }"}。起点会把这些字段作为输出传给下游。
          </div>
        </div>

        {!head && (
          <div className="validation-banner" style={{ marginTop: 8 }}>
            还没有可运行的修订，请先点击「发布」。
          </div>
        )}
      </Modal>
    </div>
  );
}
