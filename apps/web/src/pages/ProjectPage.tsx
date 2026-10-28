import { useState } from "react";
import { Button, Input, Modal, Table, Tag, message } from "antd";
import { ArrowLeftOutlined, ArrowRightOutlined, PlusOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { api, problemMessage } from "../lib/api";
import type { ListResponse, PipelineSummary, Project, RunSummary } from "../lib/types";
import { formatDuration, formatTime, shortId } from "../lib/format";
import { StatusTag } from "../components/StatusTag";
import { Splash } from "../components/Splash";

export function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");

  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api<Project>(`/v1/projects/${projectId}`),
    enabled: !!projectId,
  });

  const pipelines = useQuery({
    queryKey: ["pipelines", projectId],
    queryFn: () => api<ListResponse<PipelineSummary>>(`/v1/projects/${projectId}/pipelines`),
    enabled: !!projectId,
  });

  const runs = useQuery({
    queryKey: ["runs", "project", projectId],
    queryFn: () => api<ListResponse<RunSummary>>(`/v1/runs?projectId=${projectId}&limit=8`),
    enabled: !!projectId,
    refetchInterval: (query) => {
      const data = query.state.data as ListResponse<RunSummary> | undefined;
      return data?.items.some((run) => run.status === "running" || run.status === "queued") ? 2500 : false;
    },
  });

  const create = useMutation({
    mutationFn: () =>
      api<PipelineSummary>(`/v1/projects/${projectId}/pipelines`, { method: "POST", body: { name } }),
    onSuccess: (pipeline) => {
      queryClient.invalidateQueries({ queryKey: ["pipelines", projectId] });
      setModalOpen(false);
      setName("");
      navigate(`/pipelines/${pipeline.id}`);
    },
    onError: (error) => message.error(problemMessage(error)),
  });

  if (project.isLoading) return <Splash label="正在读取项目" />;
  if (project.isError || !project.data) {
    return (
      <div className="empty-state">
        <h3>项目不存在</h3>
        <p>{project.isError ? problemMessage(project.error) : "请返回工作区重新选择。"}</p>
      </div>
    );
  }

  const items = pipelines.data?.items ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <Button
            type="text"
            size="small"
            icon={<ArrowLeftOutlined />}
            style={{ paddingLeft: 0, marginBottom: 6 }}
            onClick={() => navigate(project.data?.workspace ? `/w/${project.data.workspace.slug}` : "/")}
          >
            返回工作区
          </Button>
          <h1 className="page-title">{project.data.name}</h1>
          <p className="page-subtitle">
            <span className="mono">{project.data.slug}</span>
            <span style={{ marginLeft: 12 }}>创建于 {formatTime(project.data.createdAt)}</span>
          </p>
        </div>
        <div className="toolbar">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            新建管道
          </Button>
        </div>
      </div>

      <div className="section-head">
        <h2>管道</h2>
        <span className="dim" style={{ fontSize: 11 }}>{items.length} 条</span>
      </div>

      {pipelines.isLoading ? (
        <Splash label="正在读取管道" />
      ) : items.length === 0 ? (
        <div className="empty-state">
          <h3>还没有管道</h3>
          <p>管道由起点、模型调用、分支、请求与响应步骤组成。</p>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            创建第一条管道
          </Button>
        </div>
      ) : (
        <div className="grid">
          {items.map((pipeline) => (
            <div className="card" key={pipeline.id} onClick={() => navigate(`/pipelines/${pipeline.id}`)}>
              <span className="card__accent" />
              <div className="card__top">
                <h3 className="card__title">{pipeline.name}</h3>
                {pipeline.headRevision ? (
                  <Tag color="gold" style={{ margin: 0 }}>v{pipeline.headRevision.number}</Tag>
                ) : (
                  <Tag style={{ margin: 0 }}>未发布</Tag>
                )}
              </div>
              <div className="card__meta">
                <span>{pipeline.revisionCount} 个修订</span>
                <span>{pipeline.runCount} 次运行</span>
              </div>
              <div className="card__foot">
                <span>更新于 {formatTime(pipeline.updatedAt)}</span>
                <ArrowRightOutlined style={{ marginLeft: "auto", color: "#6f7888" }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="section-head">
        <h2>最近的运行</h2>
        <span className="dim" style={{ fontSize: 11 }}>所有管道</span>
      </div>

      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        <Table<RunSummary>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={runs.data?.items ?? []}
          loading={runs.isLoading}
          locale={{ emptyText: "还没有运行记录" }}
          onRow={(record) => ({ onClick: () => navigate(`/runs/${record.id}`), style: { cursor: "pointer" } })}
          columns={[
            {
              title: "状态",
              dataIndex: "status",
              width: 100,
              render: (status: RunSummary["status"]) => <StatusTag status={status} />,
            },
            {
              title: "管道",
              dataIndex: ["pipeline", "name"],
              render: (value: string) => <span style={{ fontWeight: 600 }}>{value}</span>,
            },
            {
              title: "运行",
              dataIndex: "id",
              width: 120,
              render: (value: string) => <span className="mono dim">{shortId(value)}</span>,
            },
            {
              title: "开始",
              dataIndex: "createdAt",
              width: 180,
              render: (value: string) => <span className="dim">{formatTime(value)}</span>,
            },
            {
              title: "耗时",
              dataIndex: "durationMs",
              width: 90,
              render: (value: number | null) => <span className="mono">{formatDuration(value)}</span>,
            },
          ]}
        />
      </div>

      <Modal
        title="新建管道"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => {
          if (!name.trim()) {
            message.warning("请输入管道名称");
            return;
          }
          create.mutate();
        }}
        confirmLoading={create.isPending}
        okText="创建并编辑"
        cancelText="取消"
      >
        <Input
          placeholder="例如：线索分级"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onPressEnter={() => name.trim() && create.mutate()}
        />
      </Modal>
    </div>
  );
}
